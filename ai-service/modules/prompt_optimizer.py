import asyncio
import logging
import random
from typing import Dict, List, Optional
from pathlib import Path
import json
import os
import sys

logger = logging.getLogger(__name__)

from transformers import Qwen2_5_VLForConditionalGeneration, AutoTokenizer, AutoProcessor
from qwen_vl_utils import process_vision_info
import torch
import gc
TRANSFORMERS_AVAILABLE = True

class PromptOptimizer:
    """Prompt优化器，用于优化用户输入的prompt"""
    
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.processor = None
        self.model_loaded = False
        self.model_path = None
        self.is_model_loaded = False
        
        # 加载配置，但不初始化模型（延迟加载）
        self._load_config()
    
    def _load_config(self):
        """加载配置文件"""
        try:
            config_path = Path(__file__).parent.parent.parent / "config" / "config.json"
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    
                models = config.get('models', {})
                qwen_model = models.get('qwen', {})
                
                if qwen_model.get('enabled', False):
                    self.model_path = qwen_model.get('path')
                    logger.info(f"Qwen model path configured: {self.model_path}")
                    
        except Exception as e:
            logger.warning(f"Could not load config: {e}")
    
    def _initialize_model(self):
        """初始化Qwen模型"""
        if self.is_model_loaded:
            return
            
        if not TRANSFORMERS_AVAILABLE:
            raise RuntimeError("Transformers not available. Please install required dependencies.")
            
        if not self.model_path or not os.path.exists(self.model_path):
            raise RuntimeError(f"Qwen model path not found: {self.model_path}. Please check configuration.")
            
        try:
            logger.info("Loading Qwen2.5-VL model on demand...")
            # Load model using the correct class
            self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                self.model_path,
                torch_dtype="auto",
                device_map="auto"
            )
            
            # Load processor
            self.processor = AutoProcessor.from_pretrained(self.model_path)
            
            # Keep tokenizer for compatibility
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_path,
                trust_remote_code=True
            )
            
            self.model_loaded = True
            self.is_model_loaded = True
            logger.info("Qwen2.5-VL model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Qwen model: {e}")
            self.model = None
            self.tokenizer = None
            self.processor = None
    
    async def optimize(self, prompt: str, optimization_type: str = "通用型", 
                      style_preferences: List[str] = [], task_type: str = "image") -> str:
        """优化prompt"""
        logger.info(f"Optimizing prompt: {prompt}")
        logger.info(f"Optimization type: {optimization_type}")
        logger.info(f"Task type: {task_type}")
        
        # 按需加载模型
        if not self.is_model_loaded:
            logger.info("Model not loaded, initializing now...")
            self._initialize_model()
        
        # 检查模型是否已加载
        if not self.is_model_loaded or not self.model or not self.processor:
            raise RuntimeError("Prompt optimization model (Qwen2.5-VL) is not loaded. Please check model configuration.")
        
        try:
            # 使用AI模型优化
            result = await self._optimize_with_model(prompt, optimization_type, style_preferences, task_type)
            
            # Automatically unload model after use
            self.unload_model()
            
            return result
        except Exception as e:
            logger.error(f"Error optimizing prompt: {e}")
            # Ensure model is unloaded even on error
            self.unload_model()
            raise RuntimeError(f"Prompt optimization failed: {str(e)}")
    
    async def _optimize_with_model(self, prompt: str, optimization_type: str, style_preferences: List[str], task_type: str = "image") -> str:
        """使用Qwen2.5-VL模型优化提示词"""
        if self.processor == None or self.model == None:
            raise RuntimeError("Model or processor not initialized.")
        try:
            # 根据任务类型构建不同的用户消息
            if task_type == "image":
                user_message = f"请优化这个图像生成提示词：{prompt}"
                if optimization_type != "通用型":
                    user_message += f"\n优化类型：{optimization_type}"
                if style_preferences:
                    user_message += f"\n风格偏好：{', '.join(style_preferences)}"
                
                user_message += "\n\n请尽量用名词,形容词(彼此之间用逗号隔开)的方式, 将其优化为详细、具体、适合AI图像生成的英文提示词。包含具体的视觉细节包含,人物主体, 构图, 情绪等。请直接输出优化后的英文提示词，不要包含其他解释, 返回的单词不要用*号加粗。"
            else:  # video
                user_message = f"请优化这个视频生成提示词：{prompt}"
                if optimization_type != "通用型":
                    user_message += f"\n优化类型：{optimization_type}"
                if style_preferences:
                    user_message += f"\n风格偏好：{', '.join(style_preferences)}"
                
                user_message += "\n\n请将其优化为详细、具体、适合AI视频生成的中文提示词。包含动作描述、运动轨迹、场景转换、摄像机运动（推拉摇移）等动态元素。请直接输出优化后的中文提示词，不要包含其他解释。"
            
            # 构建对话消息（纯文本模式）
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_message}
                    ]
                }
            ]
            
            # 应用聊天模板
            text = self.processor.apply_chat_template(
                messages, 
                tokenize=False, 
                add_generation_prompt=True
            )
            
            # 处理视觉信息（这里没有图像，所以为空）
            image_inputs, video_inputs = process_vision_info(messages) #type: ignore
            
            # 使用processor处理输入
            inputs = self.processor(
                text=[text],
                images=image_inputs,
                videos=video_inputs,
                padding=True,
                return_tensors="pt"
            )
            
            # 移动到设备
            inputs = inputs.to(self.model.device)
            
            # 生成优化后的提示词
            with torch.no_grad():
                generated_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=512,
                    do_sample=True,
                    temperature=0.7,
                    top_p=0.9,
                    repetition_penalty=1.1
                )
            
            # 解码生成的文本
            generated_ids_trimmed = [
                out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            
            optimized_prompt = self.processor.batch_decode(
                generated_ids_trimmed, 
                skip_special_tokens=True, 
                clean_up_tokenization_spaces=False
            )[0].strip()
            
            logger.info(f"AI optimized prompt: {optimized_prompt}")
            return optimized_prompt
            
        except Exception as e:
            logger.error(f"Error in AI optimization: {e}")
            raise RuntimeError(f"AI model optimization failed: {str(e)}")
    

    
    async def batch_optimize(self, prompts: List[str], optimization_type: str = "通用型") -> List[str]:
        """批量优化prompt"""
        tasks = [self.optimize(prompt, optimization_type) for prompt in prompts]
        return await asyncio.gather(*tasks)
    
    def get_optimization_types(self) -> List[str]:
        """获取可用的优化类型（不再提供默认模板，返回空列表或基本类型）"""
        return []
    
    def get_style_suggestions(self, optimization_type: str = "通用型") -> List[str]:
        """获取风格建议（无默认建议，返回空列表）"""
        return []
    
    def unload_model(self):
        """Unload the model to free memory"""
        if self.is_model_loaded:
            logger.info("Unloading Qwen2.5-VL model to free memory...")
            
            # Delete model components
            if self.model is not None:
                del self.model
                self.model = None
            
            if self.tokenizer is not None:
                del self.tokenizer
                self.tokenizer = None
                
            if self.processor is not None:
                del self.processor
                self.processor = None
            
            # Clear GPU cache if using CUDA
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            # Force garbage collection
            gc.collect()
            
            self.model_loaded = False
            self.is_model_loaded = False
            logger.info("Qwen2.5-VL model unloaded successfully")

# 测试函数
if __name__ == "__main__":
    async def test_optimizer():
        optimizer = PromptOptimizer()
        
        test_prompts = [
            "一只可爱的小猫",
            "美丽的风景",
            "科技感的机器人"
        ]
        
        for prompt in test_prompts:
            optimized = await optimizer.optimize(prompt, "通用型")
            print(f"原始: {prompt}")
            print(f"优化: {optimized}")
            print("-" * 50)
    
    asyncio.run(test_optimizer())