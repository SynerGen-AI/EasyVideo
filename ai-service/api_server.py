from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import sys
import logging
import json
import asyncio
from pathlib import Path

# Add modules directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'modules'))

# Import AI modules
try:
    from modules.prompt_optimizer import PromptOptimizer
    from modules.image_generator import ImageGenerator
    from modules.video_generator import VideoGenerator
    from modules.storyboard_generator import StoryboardGenerator
except ImportError as e:
    print(f"Warning: Could not import AI modules: {e}")
    print("AI service will run in mock mode")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="EasyVideo AI Service",
    description="AI服务接口，提供prompt优化、图像生成、视频生成等功能",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response models
class PromptOptimizeRequest(BaseModel):
    prompt: str
    type: str = "通用型"
    style_preferences: List[str] = []

class PromptOptimizeResponse(BaseModel):
    optimized_prompt: str
    original_prompt: str
    optimization_type: str

class ImageGenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    seed: Optional[int] = None
    num_images: int = 1
    output_dir: str
    task_id: str

class ImageGenerateResponse(BaseModel):
    images: List[str]
    task_id: str

class VideoGenerateRequest(BaseModel):
    image_path: str
    prompt: Optional[str] = ""
    negative_prompt: Optional[str] = "static, blurry, low quality"
    fps: int = 15
    duration: int = 4
    seed: Optional[int] = None
    tiled: bool = True
    num_inference_steps: int = 20
    cfg_scale: float = 7.5
    motion_strength: float = 0.5
    output_dir: str
    task_id: str

class VideoGenerateResponse(BaseModel):
    video_path: str
    task_id: str

class StoryboardGenerateRequest(BaseModel):
    story_description: str
    num_scenes: int = 5
    style: str = "现代风格"

class StoryboardScene(BaseModel):
    scene_number: int
    description: str
    prompt: str
    duration: int
    transition_type: str

class StoryboardGenerateResponse(BaseModel):
    scenes: List[StoryboardScene]

# Initialize AI modules (lazy loading)
AI_MODULES_LOADED = True
prompt_optimizer = None
image_generator = None
video_generator = None
storyboard_generator = None

# Task progress tracking
task_progress = {}

def get_prompt_optimizer():
    global prompt_optimizer
    if prompt_optimizer is None:
        try:
            prompt_optimizer = PromptOptimizer()
            logger.info("PromptOptimizer initialized on demand")
        except Exception as e:
            logger.error(f"Failed to initialize PromptOptimizer: {e}")
            raise HTTPException(status_code=503, detail=f"Prompt优化模块初始化失败: {str(e)}")
    return prompt_optimizer

def get_image_generator():
    global image_generator
    if image_generator is None:
        try:
            image_generator = ImageGenerator()
            logger.info("ImageGenerator initialized on demand")
        except Exception as e:
            logger.error(f"Failed to initialize ImageGenerator: {e}")
            raise HTTPException(status_code=503, detail=f"图像生成模块初始化失败: {str(e)}")
    return image_generator

def get_video_generator():
    global video_generator
    if video_generator is None:
        try:
            video_generator = VideoGenerator()
            logger.info("VideoGenerator initialized on demand")
        except Exception as e:
            logger.error(f"Failed to initialize VideoGenerator: {e}")
            raise HTTPException(status_code=503, detail=f"视频生成模块初始化失败: {str(e)}")
    return video_generator

def get_storyboard_generator():
    global storyboard_generator
    if storyboard_generator is None:
        try:
            storyboard_generator = StoryboardGenerator()
            logger.info("StoryboardGenerator initialized on demand")
        except Exception as e:
            logger.error(f"Failed to initialize StoryboardGenerator: {e}")
            raise HTTPException(status_code=503, detail=f"故事板生成模块初始化失败: {str(e)}")
    return storyboard_generator

logger.info("AI service started with lazy loading support")

@app.get("/")
async def root():
    return {
        "message": "EasyVideo AI Service",
        "status": "running",
        "ai_modules_loaded": AI_MODULES_LOADED
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "ai_modules_loaded": AI_MODULES_LOADED,
        "timestamp": str(Path().cwd())
    }

@app.post("/prompt/optimize", response_model=PromptOptimizeResponse)
async def optimize_prompt(request: PromptOptimizeRequest):
    optimizer = None
    try:
        optimizer = get_prompt_optimizer()
        optimized = await optimizer.optimize(
            request.prompt,
            request.type,
            request.style_preferences
        )
        
        return PromptOptimizeResponse(
            optimized_prompt=optimized,
            original_prompt=request.prompt,
            optimization_type=request.type
        )
    except Exception as e:
        logger.error(f"Error optimizing prompt: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # 确保模型卸载
        if optimizer and hasattr(optimizer, 'unload_model'):
            try:
                optimizer.unload_model()
                logger.info("PromptOptimizer model unloaded successfully")
            except Exception as e:
                logger.warning(f"Failed to unload PromptOptimizer model: {e}")

async def generate_image_new(request: ImageGenerateRequest):
    try:
        # Initialize task progress
        task_progress[request.task_id] = {"progress": 0, "status": "starting"}
        
        # 立即返回任务ID，不等待生成器初始化
        logger.info(f"Image generation task queued for task_id: {request.task_id}")
        
        # 在后台异步初始化和执行视频生成
        asyncio.create_task(initialize_and_generate_Image(request))
        
        return ImageGenerateResponse(
            Image_path="",  # Will be updated when generation completes
            task_id=request.task_id
        )
    except Exception as e:
        logger.error(f"Error queuing Image generation: {e}")
        task_progress[request.task_id] = {"progress": 0, "status": "failed", "error": str(e)}
        raise HTTPException(status_code=500, detail=f"视频生成队列失败: {str(e)}") 

async def initialize_and_generate_Image(request: ImageGenerateRequest):
    """完全异步的图片生成初始化和执行"""
    generator = None
    try:
        # 更新状态为初始化中
        task_progress[request.task_id] = {"progress": 5, "status": "initializing"}
        
        # 异步初始化生成器
        generator = await asyncio.get_event_loop().run_in_executor(
            None, get_image_generator
        )
        
        # 设置进度回调
        def progress_callback(progress: int, status: str = "processing"):
            task_progress[request.task_id] = {"progress": progress, "status": status}
        
        generator.set_progress_callback(request.task_id, progress_callback)

        # 更新状态为生成中
        task_progress[request.task_id] = {"progress": 10, "status": "processing"}
        
        # 异步执行视频生成
        video_path = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: asyncio.run(generator.generate_from_image(
                image_path=request.image_path,
                prompt=request.prompt,
                negative_prompt=request.negative_prompt,
                fps=request.fps,
                duration=request.duration,
                seed=request.seed,
                tiled=request.tiled,
                num_inference_steps=request.num_inference_steps,
                cfg_scale=request.cfg_scale,
                motion_strength=request.motion_strength,
                output_dir=request.output_dir,
                task_id=request.task_id,

            ))
        )
        
        # Mark as completed and store video path
        task_progress[request.task_id] = {
            "progress": 100, 
            "status": "completed",
            "video_path": video_path
        }
        
        logger.info(f"Video generation completed for task_id: {request.task_id}")
        
        # Clean up task progress after a delay
        asyncio.create_task(cleanup_task_progress(request.task_id, delay=300))  # 5分钟后清理
        
    except Exception as e:
        logger.error(f"Error in video generation pipeline: {e}")
        task_progress[request.task_id] = {"progress": 0, "status": "failed", "error": str(e)}
        
        # Clean up task progress after a delay
        asyncio.create_task(cleanup_task_progress(request.task_id, delay=60))
    finally:
        # 确保模型卸载
        if generator and hasattr(generator, 'unload_model'):
            try:
                # 异步卸载模型
                await asyncio.get_event_loop().run_in_executor(
                    None, generator.unload_model
                )
                logger.info("VideoGenerator model unloaded successfully")
            except Exception as e:
                logger.warning(f"Failed to unload VideoGenerator model: {e}")    

@app.post("/image/generate", response_model=ImageGenerateResponse)
async def generate_image(request: ImageGenerateRequest):
    generator = None
    try:
        # Initialize task progress
        task_progress[request.task_id] = {"progress": 0, "status": "starting"}
        
        generator = get_image_generator()
        # Update progress callback
        def progress_callback(progress: int, status: str = "processing"):
            task_progress[request.task_id] = {"progress": progress, "status": status}
        
        images = await generator.generate(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            width=request.width,
            height=request.height,
            seed=request.seed,
            num_images=request.num_images,
            output_dir=request.output_dir,
            task_id=request.task_id,
            progress_callback=progress_callback
        )
        
        # Mark as completed
        task_progress[request.task_id] = {"progress": 100, "status": "completed"}
        
        # Clean up task progress after a delay
        asyncio.create_task(cleanup_task_progress(request.task_id, delay=60))
        
        return ImageGenerateResponse(
            images=images,
            task_id=request.task_id
        )
    except Exception as e:
        logger.error(f"Error generating image: {e}")
        task_progress[request.task_id] = {"progress": 0, "status": "failed", "error": str(e)}
        
        # Clean up task progress after a delay
        asyncio.create_task(cleanup_task_progress(request.task_id, delay=60))
        
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # 确保模型卸载
        if generator and hasattr(generator, 'unload_model'):
            try:
                generator.unload_model()
                logger.info("ImageGenerator model unloaded successfully")
            except Exception as e:
                logger.warning(f"Failed to unload ImageGenerator model: {e}")

@app.post("/video/generate", response_model=VideoGenerateResponse)
async def generate_video(request: VideoGenerateRequest):
    try:
        # Initialize task progress
        task_progress[request.task_id] = {"progress": 0, "status": "starting"}
        
        # 立即返回任务ID，不等待生成器初始化
        logger.info(f"Video generation task queued for task_id: {request.task_id}")
        
        # 在后台异步初始化和执行视频生成
        asyncio.create_task(initialize_and_generate_video(request))
        
        return VideoGenerateResponse(
            video_path="",  # Will be updated when generation completes
            task_id=request.task_id
        )
    except Exception as e:
        logger.error(f"Error queuing video generation: {e}")
        task_progress[request.task_id] = {"progress": 0, "status": "failed", "error": str(e)}
        raise HTTPException(status_code=500, detail=f"视频生成队列失败: {str(e)}")

async def initialize_and_generate_video(request: VideoGenerateRequest):
    """完全异步的视频生成初始化和执行"""
    generator = None
    try:
        # 更新状态为初始化中
        task_progress[request.task_id] = {"progress": 5, "status": "initializing"}
        
        # 异步初始化生成器
        generator = await asyncio.get_event_loop().run_in_executor(
            None, get_video_generator
        )
        
        # 设置进度回调
        def progress_callback(progress: int, status: str = "processing"):
            task_progress[request.task_id] = {"progress": progress, "status": status}
        
        generator.set_progress_callback(request.task_id, progress_callback)

        # 更新状态为生成中
        task_progress[request.task_id] = {"progress": 10, "status": "processing"}
        
        # 异步执行视频生成
        video_path = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: asyncio.run(generator.generate_from_image(
                image_path=request.image_path,
                prompt=request.prompt,
                negative_prompt=request.negative_prompt,
                fps=request.fps,
                duration=request.duration,
                seed=request.seed,
                tiled=request.tiled,
                num_inference_steps=request.num_inference_steps,
                cfg_scale=request.cfg_scale,
                motion_strength=request.motion_strength,
                output_dir=request.output_dir,
                task_id=request.task_id,
            ))
        )
        
        # Mark as completed and store video path
        task_progress[request.task_id] = {
            "progress": 100, 
            "status": "completed",
            "video_path": video_path
        }
        
        logger.info(f"Video generation completed for task_id: {request.task_id}")
        
        # Clean up task progress after a delay
        asyncio.create_task(cleanup_task_progress(request.task_id, delay=300))  # 5分钟后清理
        
    except Exception as e:
        logger.error(f"Error in video generation pipeline: {e}")
        task_progress[request.task_id] = {"progress": 0, "status": "failed", "error": str(e)}
        
        # Clean up task progress after a delay
        asyncio.create_task(cleanup_task_progress(request.task_id, delay=60))
    finally:
        # 确保模型卸载
        if generator and hasattr(generator, 'unload_model'):
            try:
                # 异步卸载模型
                await asyncio.get_event_loop().run_in_executor(
                    None, generator.unload_model
                )
                logger.info("VideoGenerator model unloaded successfully")
            except Exception as e:
                logger.warning(f"Failed to unload VideoGenerator model: {e}")

async def cleanup_task_progress(task_id: str, delay: int = 60):
    """延迟清理任务进度记录"""
    await asyncio.sleep(delay)
    if task_id in task_progress:
        del task_progress[task_id]
        logger.info(f"Cleaned up task progress for task_id: {task_id}")

@app.get("/task/progress/{task_id}")
async def get_task_progress(task_id: str):
    """获取任务进度"""
    progress = task_progress.get(task_id, {"progress": 0, "status": "unknown"})
    return progress

@app.get("/task/progress/{task_id}/stream")
async def stream_task_progress(task_id: str):
    """流式获取任务进度"""
    async def generate_progress():
        while True:
            progress = task_progress.get(task_id, {"progress": 0, "status": "unknown"})
            yield f"data: {json.dumps(progress)}\n\n"
            
            # 如果任务完成或失败，停止流式传输
            if progress.get("status") in ["completed", "failed"]:
                break
            
            await asyncio.sleep(0.5)
    
    return StreamingResponse(
        generate_progress(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

@app.post("/storyboard/generate", response_model=StoryboardGenerateResponse)
async def generate_storyboard(request: StoryboardGenerateRequest):
    try:
        # Initialize task progress
        task_progress[request.task_id] = {"progress": 0, "status": "starting"}
        
        generator = get_storyboard_generator()
        # Update progress callback
        def progress_callback(progress: int, status: str = "processing"):
            task_progress[request.task_id] = {"progress": progress, "status": status}
        
        storyboard = await generator.generate(
            script=request.script,
            style=request.style,
            output_dir=request.output_dir,
            task_id=request.task_id,
            progress_callback=progress_callback
        )
        
        # Mark as completed
        task_progress[request.task_id] = {"progress": 100, "status": "completed"}
        
        return StoryboardGenerateResponse(
            storyboard=storyboard,
            task_id=request.task_id
        )
    except Exception as e:
        logger.error(f"Error generating storyboard: {e}")
        task_progress[request.task_id] = {"progress": 0, "status": "failed", "error": str(e)}
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("AI_SERVICE_PORT", 8000))
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
