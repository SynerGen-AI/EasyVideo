import asyncio
import logging
import os
import random
from typing import List, Optional, Dict, Any
from pathlib import Path
import json
from datetime import datetime
import shutil
import sys
import torch
import gc

logger = logging.getLogger(__name__)

# Add DiffSynth-Studio to path
sys.path.append('/root/autodl-tmp/DiffSynth-Studio')

try:
    from modelscope import FluxPipeline
    FLUX_AVAILABLE = True
    logger.info("FLUX模块导入成功")
except ImportError as e:
    logger.warning(f"FLUX模块导入失败: {e}")
    FLUX_AVAILABLE = False

try:
    from diffsynth.pipelines.flux_image_new import FluxImagePipeline, ModelConfig
    DIFFSYNTH_AVAILABLE = True
    logger.info("DiffSynth FLUX模块导入成功")
except ImportError as e:
    logger.warning(f"DiffSynth FLUX模块导入失败: {e}")
    DIFFSYNTH_AVAILABLE = False

class ImageGenerator:
    """图像生成器，用于文生图功能"""
    
    def __init__(self):
        self.model_loaded = False
        self.model_path = None
        self.pipe = None
        self.model_type = "flux_krea"  # 默认使用FLUX.1-Krea-dev
        self.is_model_loaded = False
        
        # 仅加载配置，不在初始化时加载模型（延迟加载）
        self._load_config()
        # 不调用 _initialize_model()
    
    def _load_config(self):
        """加载配置文件"""
        try:
            config_path = Path(__file__).parent.parent.parent / "config" / "config.json"
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    
                models = config.get('models', {})
                flux_model = models.get('flux_kontext', {})  # 使用flux_kontext模型
                
                if flux_model.get('enabled', False):
                    self.model_path = flux_model.get('path')
                    logger.info(f"FLUX model path configured: {self.model_path}")
                    
        except Exception as e:
            logger.warning(f"Could not load config: {e}")
    
    def _initialize_model(self):
        """初始化FLUX模型"""
        if self.is_model_loaded:
            return
            
        if self.model_type == "flux_krea":
            self._initialize_flux_krea()
        elif self.model_type == "flux_kontext":
            self._initialize_flux_kontext()
        else:
            logger.warning(f"Unknown model type: {self.model_type}")
    
    def _initialize_flux_krea(self):
        """初始化FLUX.1-Krea-dev模型"""
        if not FLUX_AVAILABLE:
            raise RuntimeError("ModelScope FluxPipeline not available. Please install required dependencies.")
            
        # 检查模型路径是否存在
        if not self.model_path or not os.path.exists(self.model_path):
            raise RuntimeError(f"FLUX model path not found: {self.model_path}")
            
        try:
            logger.info(f"Loading FLUX.1-Krea-dev model on demand from: {self.model_path}")
            self.pipe = FluxPipeline.from_pretrained(
                self.model_path, 
                torch_dtype=torch.bfloat16,
                low_cpu_mem_usage=True
            )
            self.pipe.enable_sequential_cpu_offload()  # memory optimization
            if hasattr(self.pipe, 'enable_attention_slicing'):
                self.pipe.enable_attention_slicing(1)  # reduce memory usage
            self.model_loaded = True
            self.is_model_loaded = True
            logger.info("FLUX.1-Krea-dev model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load FLUX.1-Krea-dev model: {e}")
            raise RuntimeError(f"FLUX.1-Krea-dev model loading failed: {str(e)}")
    
    def _initialize_flux_kontext(self):
        """初始化FLUX.1-Kontext-dev模型（图像编辑）"""
        if not DIFFSYNTH_AVAILABLE:
            raise RuntimeError("DiffSynth-Studio not available. Please install required dependencies.")
            
        if not self.model_path or not os.path.exists(self.model_path):
            raise RuntimeError(f"FLUX model path not found: {self.model_path}. Please check configuration.")
            
        try:
            logger.info("Loading FLUX.1-Kontext-dev model on demand...")
            self.pipe = FluxImagePipeline.from_pretrained(
                torch_dtype=torch.bfloat16,
                device="cuda" if torch.cuda.is_available() else "cpu",
                model_configs=[
                    ModelConfig(path=os.path.join(self.model_path, "flux1-kontext-dev.safetensors")),
                    ModelConfig(path=os.path.join(self.model_path, "text_encoder", "model.safetensors")),
                    ModelConfig(path=os.path.join(self.model_path, "text_encoder_2")),
                    ModelConfig(path=os.path.join(self.model_path, "ae.safetensors")),
                ],
            )
            self.model_loaded = True
            self.is_model_loaded = True
            logger.info("FLUX.1-Kontext-dev model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load FLUX.1-Kontext-dev model: {e}")
            raise RuntimeError(f"FLUX.1-Kontext-dev model loading failed: {str(e)}")
    
    async def generate(self, prompt: str, negative_prompt: str = "", 
                      width: int = 1024, height: int = 1024, 
                      seed: Optional[int] = None, num_images: int = 1,
                      output_dir: str = "", task_id: str = "", 
                      inference_steps: int = 20, CFG_scale: int = 7.5,
                      progress_callback: Optional[callable] = None) -> List[str]:
        """生成图像"""
        try:
            # 初始化进度
            if progress_callback:
                progress_callback(5, "initializing")
            
            # 按需加载模型
            if not self.is_model_loaded or not self.pipe:
                self._initialize_model()
            
            # 检查模型是否可用
            if not self.is_model_loaded or not self.pipe:
                error_msg = "FLUX model is not loaded or available. Please ensure the model is properly configured and loaded."
                logger.error(error_msg)
                raise RuntimeError(error_msg)
            
            # 对于需要本地路径的模型进行检查
            if self.model_type == "flux_kontext" and (not self.model_path or not os.path.exists(self.model_path)):
                error_msg = f"FLUX model path not found: {self.model_path}. Please check the model configuration."
                logger.error(error_msg)
                raise RuntimeError(error_msg)
            
            # 确保输出目录存在
            os.makedirs(output_dir, exist_ok=True)
            
            if progress_callback:
                progress_callback(10, "preparing")
            
            # 如果没有提供seed，生成随机seed
            if seed is None:
                seed = random.randint(0, 2**32 - 1)
            
            # 不再进行prompt优化失败时的回退，若优化失败则抛错
            optimized_prompt = prompt
            from .prompt_optimizer import PromptOptimizer
            optimizer = PromptOptimizer()
            optimized_prompt = await optimizer.optimize(prompt, task_type="image")
            logger.info(f"Original prompt: {prompt}")
            logger.info(f"Optimized prompt: {optimized_prompt}")
            
            if progress_callback:
                progress_callback(20, "optimizing_prompt")
            
            # 不再自动合并默认负面提示词，直接使用传入的negative_prompt
            full_negative_prompt = negative_prompt or ""
            
            # 生成图像文件路径
            image_paths = []
            for i in range(num_images):
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"img_{task_id}_{timestamp}_{i+1}_seed{seed+i}.jpg"
                image_path = os.path.join(output_dir, filename)
                image_paths.append(image_path)
            
            if progress_callback:
                progress_callback(30, "generating")
            
            # 使用真实模型生成
            generated_paths = await self._generate_with_model(
                optimized_prompt, full_negative_prompt, width, height, 
                seed, num_images, image_paths, inference_steps, CFG_scale,  progress_callback
            )
            
            # 自动卸载模型以释放内存
            self.unload_model()
            
            return generated_paths
            
        except Exception as e:
            logger.error(f"Error generating images: {e}")
            # 确保即使出错也卸载模型
            self.unload_model()
            raise
    
    async def _generate_with_model(self, prompt: str, negative_prompt: str,
                                  width: int, height: int, seed: int,
                                  num_images: int, image_paths: List[str],
                                  inference_steps: int = 20, CFG_scale: int =7.0,
                                  progress_callback: Optional[callable] = None) -> List[str]:
        """使用真实模型生成图像"""
        try:
            if not self.pipe:
                raise Exception("FLUX model not initialized")
                
            logger.info(f"Generating {num_images} images with FLUX model")
            logger.info(f"Prompt: {prompt}")
            logger.info(f"Size: {width}x{height}, Seed: {seed}")
            
            generated_paths = []
            
            for i in range(num_images):
                current_seed = seed + i
                logger.info(f"Generating image {i + 1}/{num_images} with seed {current_seed}")

                # 更新进度：30% + (i / num_images) * 70%
                if progress_callback:
                    progress = 30 + int((i / num_images) * 70)
                    progress_callback(progress, f"generating_image_{i + 1}")

                if self.model_type == "flux_krea":
                    gen = torch.Generator(device="cuda").manual_seed(current_seed)
                    image = self.pipe(
                        prompt,
                        negative_prompt=negative_prompt if negative_prompt else None,
                        height=height,
                        width=width,
                        generator = gen,
                        num_inference_steps=inference_steps,
                        num_images_per_prompt = num_images,
                        guidance_scale=CFG_scale,
                        callback_on_step_end=lambda pipe,step_idx, t,callback_kwarg: (progress_callback(round(((step_idx+1)/inference_steps + i) * 70 / num_images) + 30, "processing"),{})[1]
                    ).images[0]
                elif self.model_type == "flux_kontext":
                    image = self.pipe(
                        prompt=prompt,
                        negative_prompt=negative_prompt if negative_prompt else None,
                        seed=current_seed,
                        width=width,
                        height=height,
                        embedded_guidance=4.5,
                        num_inference_steps = inference_steps,
                        cfg_scale=2.0 if negative_prompt else None,
                        callback_on_step_end=lambda pipe,step_idx, t,callback_kwarg: (progress_callback(round(((step_idx+1)/inference_steps + i) * 70 / num_images) + 30, "processing"),{})[1]
                    )
                else:
                    raise Exception(f"Unknown model type: {self.model_type}")
                
                image.save(image_paths[i])
                generated_paths.append(image_paths[i])
            
            if progress_callback:
                progress_callback(95, "finalizing")
            
            return generated_paths
        except Exception as e:
            logger.error(f"Model generation error: {e}")
            raise
    
    async def _generate_mock_images(self, prompt: str, image_paths: List[str],
                                   width: int, height: int, seed: int) -> List[str]:
        """生成模拟图像"""
        logger.info(f"Generating {len(image_paths)} mock images")
        logger.info(f"Prompt: {prompt}")
        
        # 模拟生成时间
        await asyncio.sleep(1)
        
        for image_path in image_paths:
            await self._create_mock_image_file(image_path, width, height)
        
        return image_paths
    
    async def _create_mock_image_file(self, image_path: str, width: int, height: int):
        """创建模拟图像文件"""
        try:
            # 创建一个简单的图像文件（实际应用中这里会是真实的图像数据）
            mock_content = f"Mock image file\nSize: {width}x{height}\nPath: {image_path}\nGenerated: {datetime.now()}"
            
            with open(image_path, 'w', encoding='utf-8') as f:
                f.write(mock_content)
                
            logger.info(f"Mock image created: {image_path}")
            
        except Exception as e:
            logger.error(f"Error creating mock image: {e}")
            raise
    
    def _combine_negative_prompts(self, user_negative: str) -> str:
        """合并用户负面prompt和默认负面prompt"""
        if user_negative:
            return f"{user_negative}, {self.default_negative_prompt}"
        return self.default_negative_prompt
    
    async def batch_generate(self, requests: List[dict]) -> List[dict]:
        """批量生成图像"""
        results = []
        
        for req in requests:
            try:
                images = await self.generate(**req)
                results.append({
                    "success": True,
                    "images": images,
                    "request": req
                })
            except Exception as e:
                results.append({
                    "success": False,
                    "error": str(e),
                    "request": req
                })
        
        return results
    
    def get_supported_sizes(self) -> List[tuple]:
        """获取支持的图像尺寸"""
        return [
            (512, 512),
            (768, 768),
            (1024, 1024),
            (1024, 768),
            (768, 1024),
            (1280, 720),
            (720, 1280)
        ]
    
    def validate_parameters(self, width: int, height: int, num_images: int) -> bool:
        """验证生成参数"""
        # 检查尺寸
        if width < 256 or height < 256 or width > 2048 or height > 2048:
            return False
        
        # 检查数量
        if num_images < 1 or num_images > 10:
            return False
        
        # 检查尺寸比例
        ratio = max(width, height) / min(width, height)
        if ratio > 4:  # 最大比例4:1
            return False
        
        return True
    
    def estimate_generation_time(self, num_images: int, width: int, height: int) -> int:
        """估算生成时间（秒）"""
        base_time = 10  # 基础时间
        size_factor = (width * height) / (1024 * 1024)  # 尺寸因子
        return int(base_time * num_images * size_factor)
    
    def unload_model(self):
        """卸载模型以释放内存"""
        if self.is_model_loaded:
            logger.info("Unloading FLUX model to free memory...")
            
            # 删除模型管道
            if self.pipe is not None:
                del self.pipe
                self.pipe = None
            
            # 清理GPU缓存
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            # 强制垃圾回收
            gc.collect()
            
            self.model_loaded = False
            self.is_model_loaded = False
            logger.info("FLUX model unloaded successfully")
    
    def _clear_gpu_memory(self):
        """清理GPU内存"""
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()

# 测试函数
if __name__ == "__main__":
    async def test_generator():
        generator = ImageGenerator()
        
        # 测试单张图像生成
        images = await generator.generate(
            prompt="一只可爱的小猫在花园里玩耍",
            width=1024,
            height=1024,
            num_images=2,
            output_dir="/tmp/test_images",
            task_id="test_001"
        )
        
        print(f"Generated images: {images}")
        
        # 测试参数验证
        valid = generator.validate_parameters(1024, 1024, 3)
        print(f"Parameters valid: {valid}")
        
        # 测试时间估算
        time_est = generator.estimate_generation_time(2, 1024, 1024)
        print(f"Estimated time: {time_est} seconds")

    asyncio.run(test_generator())