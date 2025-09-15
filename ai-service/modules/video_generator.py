import asyncio
import logging
import os
import random
import numpy as np
import sys
import math
import gc
from typing import List, Optional, Dict, Any, Callable
from pathlib import Path
import json
from datetime import datetime
import shutil
import torch
from PIL import Image
import torchvision.transforms.functional as TF
from .new_tqdm import NewTqdm

logger = logging.getLogger(__name__)

# 全局进度回调存储
progress_callbacks = {}

class VideoGenerator:
    """视频生成器，用于图生视频功能"""
    
    def __init__(self):
        self.model_downloaded = False
        self.is_model_loaded = False
        self.model_path = None
        self.output_dir = None
        self.supported_formats = ['mp4', 'avi', 'mov']
        self.max_duration = 30  # 最大视频时长（秒）
        self.default_fps = 24
        self.config = None
        self.set_step_callback = None
        
        # 尝试加载配置
        self._load_config()
    
    def _load_config(self):
        """加载配置文件"""
        try:
            # 导入config_manager
            config_dir = Path(__file__).parent.parent.parent / "config"
            sys.path.insert(0, str(config_dir))
            from config_manager import config_manager
            
            self.config = config_manager.get_config()
            
            # 获取模型路径
            wan_config = self.config.get('models', {}).get('wan_i2v', {})
            if wan_config.get('enabled', False):
                # 转换为绝对路径
                model_path = wan_config.get('path', '')
                if model_path.startswith('../'):
                    # 相对于项目根目录
                    project_root = Path(__file__).parent.parent.parent
                    self.model_path = str(project_root / model_path.lstrip('../'))
                else:
                    self.model_path = model_path
            
            # 获取输出目录
            output_dir = self.config.get('paths', {}).get('output_dir', './outputs')
            if output_dir.startswith('./'):
                project_root = Path(__file__).parent.parent.parent
                self.output_dir = str(project_root / output_dir.lstrip('./'))
            else:
                self.output_dir = output_dir
                
            logger.info(f"Model path: {self.model_path}")
            logger.info(f"Output dir: {self.output_dir}")
            
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
    
    def _clear_gpu_memory(self):
        """清理GPU内存"""
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        gc.collect()
    
    def _initialize_model(self):
        logger.info("Video gen: loading model")
        """初始化模型"""
        if self.is_model_loaded:
            return
            
        try:
            # 检查模型路径
            if not self.model_path or not os.path.exists(self.model_path):
                logger.error(f"Model path not found: {self.model_path}")
                self.model_downloaded = False
                return
            
            # 清理GPU内存
            self._clear_gpu_memory()
            
            # 导入必要的模块
            from diffsynth.pipelines.wan_video_new import WanVideoPipeline, ModelConfig
            import glob
            
            def six_shards(subdir):
                files = sorted(glob.glob(os.path.join(subdir, "diffusion_pytorch_model-*-of-*.safetensors")))
                if len(files) != 6:
                    logger.warning(f"在 {subdir} 只找到 {len(files)} 片，期望6片")
                return files
            
            # 配置模型
            model_configs = [
                ModelConfig(path=f"{self.model_path}/models_t5_umt5-xxl-enc-bf16.pth", offload_device="cpu", offload_dtype=torch.float8_e4m3fn),
                ModelConfig(path=six_shards(f"{self.model_path}/high_noise_model"), offload_device="cpu", offload_dtype=torch.float8_e4m3fn),
                ModelConfig(path=six_shards(f"{self.model_path}/low_noise_model"), offload_device="cpu", offload_dtype=torch.float8_e4m3fn),
                ModelConfig(path=f"{self.model_path}/Wan2.1_VAE.pth", offload_device="cpu", offload_dtype=torch.float8_e4m3fn),
            ]
            
            # 初始化模型
            self.model = WanVideoPipeline.from_pretrained(
                torch_dtype=torch.bfloat16,
                device="cuda",
                redirect_common_files=False,
                model_configs=model_configs,
            )
            
            # 启用显存管理
            gpu_limit = self.config.get('system', {}).get('gpu_memory_limit', 45)
            self.model.enable_vram_management(vram_limit=gpu_limit)
            
            self.model_downloaded = True
            self.is_model_loaded = True
            logger.info("Video generation model loaded on demand successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize model: {e}")
            self.model_downloaded = False
            self.is_model_loaded = False
            raise RuntimeError(f"Video generation model failed to load: {e}")
    
    def callback_function(step: int, timestep: int or float, latents: torch.Tensor):
        """每一扩散步的回调函数"""
        logger.info(f"CallBackFun every step: {step+1}, timestep: {timestep}")

    def set_step_callback(self, step_callback: Callable[[int, int or float, torch.Tensor], None]):
        self.set_step_callback(step_callback)

    def set_progress_callback(self, task_id: str, callback: Callable[[int, str], None]):
        """设置进度回调函数"""
        progress_callbacks[task_id] = callback
    
    def _update_progress(self, task_id: str, progress: int, status: str = ""):
        """更新进度"""
        if task_id in progress_callbacks:
            try:
                progress_callbacks[task_id](progress, status)
            except Exception as e:
                logger.error(f"Progress callback error: {e}")

    async def generate_from_image(self,
                                image_path: str,
                                prompt: str = "",
                                negative_prompt: str = "static, blurry, low quality",
                                height: int = 480, width: int = 832,
                                fps: int = 24,
                                seed: Optional[int] = None,
                                tiled: bool = True,
                                tile_size: tuple = (30, 52),
                                num_frames: int = 81,
                                num_inference_steps: int = 20,
                                cfg_scale: float = 7.5,
                                cfg_merge: bool = False,
                                switch_DiT_boundary: float = 0.875,
                                motion_strength: float = 0.5,
                                output_dir: str = "",
                                task_id: str = "",
                                ) -> str:
        """从图像生成视频"""
        try:
            # 按需加载模型
            if not self.is_model_loaded:
                self._update_progress(task_id, 5, "正在加载模型...")
                self._initialize_model()
            
            if not self.is_model_loaded:
                logger.error("视频生成模型未能成功加载，无法生成视频")
                raise RuntimeError("视频生成模型未能成功加载，无法生成视频")
            
            # 检查输入文件
            if not os.path.exists(image_path):
                logger.error(f"Input image not found: {image_path}")
                raise FileNotFoundError(f"Input image not found: {image_path}")
            
            # 设置输出路径
            if not output_dir:
                output_dir = self.output_dir
            
            os.makedirs(output_dir, exist_ok=True)
            
            # 生成输出文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_filename = f"video_{timestamp}_{task_id}.mp4"
            output_path = os.path.join(output_dir, output_filename)
            os.makedirs(output_dir, exist_ok=True)
            
            self._update_progress(task_id, 10, "正在加载输入图像...")
            
            # 加载输入图像
            image = Image.open(image_path).convert('RGB')
            #end_image = Image.open(end_img_path).convert('RGB')
            
            self._update_progress(task_id, 20, "正在优化提示词...")
            
            # 优化prompt
            # optimized_prompt = prompt
            # try:
            #     from .prompt_optimizer import PromptOptimizer
            #     optimizer = PromptOptimizer()
            #     optimized_prompt = await optimizer.optimize(prompt, task_type="video")
            #     logger.info(f"Optimized prompt: {optimized_prompt}")
            # except Exception as e:
            #     logger.warning(f"Prompt optimization failed: {e}")
            
            self._update_progress(task_id, 30, "正在生成视频...")
            
            # 生成参数
            if seed is None:
                seed = random.randint(0, sys.maxsize)
            full_prompt = f"{optimized_prompt}, cinematic lighting, smooth motion, realistic, high quality"

            logger.info(f"Generating video with prompt: {full_prompt}")
            logger.info(f"Parameters: seed={seed}, tiled={tiled}, steps={num_inference_steps}, cfg_scale={cfg_scale}")
            
            # 生成视频
            with torch.no_grad():
                video_tensor = self.model(
                    prompt=full_prompt,
                    negative_prompt=negative_prompt,
                    width=width,height=height,
                    seed=seed,
                    tiled=tiled,
                    tile_size=tile_size,
                    num_frames=num_frames,
                    num_inference_steps=num_inference_steps,
                    cfg_scale=cfg_scale,
                    cfg_merge=cfg_merge,
                    input_image=image,
                    end_image=None,
                    motion_bucket_id=motion_strength*100,
                    rand_device="cpu",
                    switch_DiT_boundary=switch_DiT_boundary,
                    progress_bar_cmd=lambda x:NewTqdm(x, callback=progress_callbacks[task_id]),
                    tea_cache_model_id = "Wan2.2-I2V-A14B",
                )
            #未添加的参数：
            #sliding_window_size: DiT 部分的滑动窗口大小。实验性功能，效果不稳定。
            #sliding_window_stride: DiT 部分的滑动窗口步长。实验性功能，效果不稳定。
            #tea_cache_l1_thresh: TeaCache 的阈值，数值越大，速度越快，画面质量越差。
            #tea_cache_model_id: TeaCache 的参数模板，可选 "Wan2.1-T2V-1.3B"、Wan2.1-T2V-14B、Wan2.1-I2V-14B-480P、Wan2.1-I2V-14B-720P 之一。
            self._update_progress(task_id, 80, "正在保存视频...")
            
            # 保存视频
            from diffsynth import save_video
            save_video(video_tensor, output_path, fps=fps, quality=5)
            
            # 清理内存
            self._clear_gpu_memory()
            
            # 自动卸载模型以释放内存
            self.unload_model()
            
            self._update_progress(task_id, 100, "视频生成完成")
            
            # 清理进度回调
            if task_id in progress_callbacks:
                del progress_callbacks[task_id]
            
            logger.info(f"Video generated successfully: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"Video generation error: {e}")
            self._update_progress(task_id, 0, f"生成失败: {str(e)}")
            # 清理进度回调
            if task_id in progress_callbacks:
                del progress_callbacks[task_id]
            # 确保即使出错也卸载模型
            self.unload_model()
            raise
    
    async def _generate_mock_video(self, image_path: str, prompt: str,
                                  duration: float, fps: int, output_dir: str, task_id: str,
                                  negative_prompt: str = "static, blurry, low quality",
                                  seed: Optional[int] = None,
                                  tiled: bool = True,
                                  num_inference_steps: int = 20,
                                  cfg_scale: float = 7.5) -> str:
        """生成模拟视频"""
        logger.info(f"Generating mock video from image: {image_path}")
        
        if not output_dir:
            output_dir = self.output_dir
        
        os.makedirs(output_dir, exist_ok=True)
        
        # 生成输出文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"mock_video_{timestamp}_{task_id}.mp4"
        output_path = os.path.join(output_dir, output_filename)
        os.makedirs(output_dir, exist_ok=True)
        
        # 模拟进度
        for i in range(0, 101, 10):
            self._update_progress(task_id, i, f"正在生成模拟视频... {i}%")
            await asyncio.sleep(0.2)
        
        # 创建模拟视频文件
        await self._create_mock_video_file(output_path, duration, fps)
        
        logger.info(f"Mock video generated: {output_path}")
        return output_path
    
    async def _create_mock_video_file(self, output_path: str, duration: float, fps: int):
        """创建模拟视频文件"""
        try:
            import cv2
            import numpy as np
            
            # 创建视频写入器
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output_path, fourcc, fps, (640, 480))
            
            # 生成帧
            total_frames = int(duration * fps)
            for i in range(total_frames):
                # 创建彩色渐变帧
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                color_value = int(255 * (i / total_frames))
                frame[:, :] = [color_value, 100, 255 - color_value]
                
                # 添加文字
                cv2.putText(frame, f'Mock Video Frame {i+1}', (50, 240), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                
                out.write(frame)
            
            out.release()
            
        except ImportError:
            # 如果没有cv2，创建一个简单的文件
            with open(output_path, 'w') as f:
                f.write(f"Mock video file - Duration: {duration}s, FPS: {fps}")
    
    def validate_parameters(self, duration: float, fps: int, motion_strength: float = 0.5) -> bool:
        """验证生成参数"""
        if duration <= 0 or duration > self.max_duration:
            return False
        if fps <= 0 or fps > 60:
            return False
        if motion_strength < 0 or motion_strength > 1:
            return False
        return True
    
    def get_supported_resolutions(self) -> List[tuple]:
        """获取支持的分辨率"""
        return [
            (640, 480),
            (1280, 720),
            (1920, 1080),
            (1024, 576)
        ]
    
    def estimate_generation_time(self, duration: float, resolution: tuple, method: str = "image") -> int:
        """估算生成时间（秒）"""
        base_time = duration * 10  # 基础时间
        resolution_factor = (resolution[0] * resolution[1]) / (640 * 480)
        return int(base_time * resolution_factor)
    
    def get_video_info(self, video_path: str) -> Dict[str, Any]:
        """获取视频信息"""
        try:
            import cv2
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                return {"error": "Cannot open video file"}
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0
            
            cap.release()
            
            return {
                "duration": duration,
                "fps": fps,
                "width": width,
                "height": height,
                "frame_count": frame_count,
                "file_size": os.path.getsize(video_path)
            }
        except Exception as e:
            return {"error": str(e)}
    
    def unload_model(self):
        """卸载模型以释放内存"""
        if self.is_model_loaded:
            logger.info("Unloading video generation model to free memory...")
            
            # 删除模型
            if self.model is not None:
                del self.model
                self.model = None
            
            # 清理GPU缓存
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
            
            # 强制垃圾回收
            gc.collect()
            
            self.model_downloaded = False
            self.is_model_loaded = False
            logger.info("Video generation model unloaded successfully")

if __name__ == "__main__":
    async def test_generator():
        generator = VideoGenerator()
        generator._initialize_model()
        print("model initialized")
        # 测试参数验证
        assert generator.validate_parameters(5.0, 24, 0.5) == True
        assert generator.validate_parameters(-1.0, 24, 0.5) == False
        
        print("VideoGenerator test passed")
    
    asyncio.run(test_generator())