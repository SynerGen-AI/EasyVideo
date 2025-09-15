import ApiService from './api';
import type {
  TextToImageRequest,
  TextToImageResponse,
  ImageToVideoRequest,
  ImageToVideoResponse,
  PromptOptimizationRequest,
  PromptOptimizationResponse,
  StoryboardRequest,
  StoryboardResponse,
  GeneratedVideo,
  GenerationTask,
  BatchGenerationRequest,
  BatchGenerationResponse,
  GenerationHistory,
  GenerationStats
} from '@/types';


export class GenerationService {
  // 文生图
  static async generateTextToImage(request: TextToImageRequest): Promise<TextToImageResponse> {
    const response = await ApiService.post<TextToImageResponse>('/api/generation/text-to-image', request);
    if (!response.success) {
      throw new Error(response.error || '文生图生成失败');
    }
    return response.data!;
  }

  // 监听任务进度
  static listenToProgress(
    taskId: string,
    onProgress: (task: any) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): () => void {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
    const eventSource = new EventSource(`${API_BASE_URL}/api/generation/progress/${taskId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          onError?.(new Error(data.error));
          eventSource.close();
          return;
        }
        onProgress(data);
        if (data.status === 'completed' || data.status === 'failed') {
          onComplete?.();
          eventSource.close();
        }
      } catch (err) {
        onError?.(new Error('Failed to parse progress data'));
        eventSource.close();
      }
    };
    
    eventSource.onerror = (error) => {
      onError?.(new Error('Connection to progress stream failed'));
      eventSource.close();
    };
    
    // 返回清理函数
    return () => {
      eventSource.close();
    };
  }

  // 图生视频
  static async generateImageToVideo(request: ImageToVideoRequest): Promise<ImageToVideoResponse> {
    const response = await ApiService.post<ImageToVideoResponse>('/api/generation/image-to-video', request);
    if (!response.success) {
      throw new Error(response.error || '图生视频生成失败');
    }
    return response.data!;
  }

  // 上传图片用于图生视频
  static async uploadImageForVideo(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<{ image_path: string; thumbnail_url: string }> {
    const response = await ApiService.upload<{ image_path: string; thumbnail_url: string }>(
      '/api/generation/upload-image',
      file,
      onProgress,
      undefined,
      'image'
    );
    if (!response.success) {
      throw new Error(response.error || '图片上传失败');
    }
    return response.data!;
  }

  // 通用图片上传
  static async uploadImage(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<{ image_id: string; image_path: string; url: string }> {
    const response = await ApiService.upload<{ image_id: string; image_path: string; url: string; filename: string; path: string }>('/api/generation/upload-image', file, onProgress, undefined, 'image');
    if (!response.success) {
      throw new Error(response.error || '图片上传失败');
    }
    return {
      image_id: response.data!.image_id,
      image_path: response.data!.path,
      url: response.data!.url
    };
  }

  // Prompt优化
  static async optimizePrompt(request: PromptOptimizationRequest): Promise<PromptOptimizationResponse> {
    const response = await ApiService.post<PromptOptimizationResponse>('/api/generation/optimize-prompt', request);
    if (!response.success) {
      throw new Error(response.error || 'Prompt优化失败');
    }
    return response.data!;
  }

  // 生成分镜脚本
  static async generateStoryboard(request: StoryboardRequest): Promise<StoryboardResponse> {
    const response = await ApiService.post<StoryboardResponse>('/api/generation/storyboard', request);
    if (!response.success) {
      throw new Error(response.error || '分镜脚本生成失败');
    }
    return response.data!;
  }

  // 批量生成
  static async batchGenerate(request: BatchGenerationRequest): Promise<BatchGenerationResponse> {
    const response = await ApiService.post<BatchGenerationResponse>('/api/generation/batch', request);
    if (!response.success) {
      throw new Error(response.error || '批量生成失败');
    }
    return response.data!;
  }

  // 获取任务状态
  static async getTaskStatus(taskId: string): Promise<GenerationTask> {
    const response = await ApiService.get<GenerationTask>(`/api/generation/task/${taskId}`);
    if (!response.success) {
      throw new Error(response.error || '获取任务状态失败');
    }
    return response.data!;
  }

  // 取消任务
  static async cancelTask(taskId: string): Promise<{ success: boolean }> {
    const response = await ApiService.delete<{ success: boolean }>(`/api/generation/task/${taskId}`);
    if (!response.success) {
      throw new Error(response.error || '取消任务失败');
    }
    return response.data!;
  }

  // 获取任务列表
  static async getTasks(
    page: number = 1,
    limit: number = 20,
    status?: string,
    type?: string
  ): Promise<{ tasks: GenerationTask[]; total: number; page: number; limit: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    
    const response = await ApiService.get(`/api/generation/tasks?${params.toString()}`);
    if (!response.success) {
      throw new Error(response.error || '获取任务列表失败');
    }
    return response.data!;
  }

  // 重试任务
  static async retryTask(taskId: string): Promise<GenerationTask> {
    const response = await ApiService.post<GenerationTask>(`/api/generation/task/${taskId}/retry`);
    if (!response.success) {
      throw new Error(response.error || '重试任务失败');
    }
    return response.data!;
  }

  // 获取生成历史
  static async getGenerationHistory(
    page: number = 1,
    limit: number = 20,
    type?: string
  ): Promise<GenerationHistory> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (type) params.append('type', type);
    
    const response = await ApiService.get<GenerationHistory>(`/api/generation/history?${params.toString()}`);
    if (!response.success) {
      throw new Error(response.error || '获取生成历史失败');
    }
    return response.data!;
  }

  // 获取生成统计
  static async getGenerationStats(): Promise<GenerationStats> {
    const response = await ApiService.get<GenerationStats>('/api/generation/stats');
    if (!response.success) {
      throw new Error(response.error || '获取生成统计失败');
    }
    return response.data!;
  }

  // 删除生成结果
  static async deleteGenerationResult(id: string, type: 'image' | 'video' | 'storyboard'): Promise<{ success: boolean }> {
    const response = await ApiService.delete<{ success: boolean }>(`/api/generation/${type}/${id}`);
    if (!response.success) {
      throw new Error(response.error || '删除生成结果失败');
    }
    return response.data!;
  }

  // 删除结果（别名方法）
  static async deleteResult(id: string): Promise<{ success: boolean }> {
    return await this.deleteGenerationResult(id, 'image');
  }

  // 下载结果（别名方法）
  static async downloadResult(id: string, filename?: string, onProgress?: (progress: number) => void): Promise<Blob> {
    return await this.downloadGenerationResult(id, 'image', filename, onProgress);
  }



  // 下载生成结果
  static async downloadGenerationResult(
    id: string,
    type: 'image' | 'video' | 'storyboard',
    filename?: string,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    return await ApiService.download(
      `/api/generation/${type}/${id}/download`,
      filename,
      onProgress
    );
  }

  // 获取预设模板
  static async getPresets(type: 'image' | 'video' | 'storyboard'): Promise<any[]> {
    const response = await ApiService.get(`/api/generation/presets/${type}`);
    if (!response.success) {
      throw new Error(response.error || '获取预设模板失败');
    }
    return response.data!;
  }

  // 保存预设模板
  static async savePreset(
    type: 'image' | 'video' | 'storyboard',
    name: string,
    config: any
  ): Promise<{ id: string }> {
    const response = await ApiService.post<{ id: string }>(`/api/generation/presets/${type}`, {
      name,
      config,
    });
    if (!response.success) {
      throw new Error(response.error || '保存预设模板失败');
    }
    return response.data!;
  }

  // 删除预设模板
  static async deletePreset(type: 'image' | 'video' | 'storyboard', id: string): Promise<{ success: boolean }> {
    const response = await ApiService.delete<{ success: boolean }>(`/api/generation/presets/${type}/${id}`);
    if (!response.success) {
      throw new Error(response.error || '删除预设模板失败');
    }
    return response.data!;
  }

  // 获取生成队列状态
  static async getQueueStatus(): Promise<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    estimated_wait_time: number;
  }> {
    const response = await ApiService.get('/api/generation/queue/status');
    if (!response.success) {
      throw new Error(response.error || '获取队列状态失败');
    }
    return response.data!;
  }

  // 清空队列
  static async clearQueue(): Promise<{ cleared: number }> {
    const response = await ApiService.delete<{ cleared: number }>('/api/generation/queue');
    if (!response.success) {
      throw new Error(response.error || '清空队列失败');
    }
    return response.data!;
  }

  // 暂停/恢复队列
  static async toggleQueue(action: 'pause' | 'resume'): Promise<{ success: boolean; status: string }> {
    const response = await ApiService.post<{ success: boolean; status: string }>(`/api/generation/queue/${action}`);
    if (!response.success) {
      throw new Error(response.error || `${action === 'pause' ? '暂停' : '恢复'}队列失败`);
    }
    return response.data!;
  }

  // 获取模型列表
  static async getAvailableModels(): Promise<{
    text_to_image: string[];
    image_to_video: string[];
    prompt_optimization: string[];
  }> {
    const response = await ApiService.get('/api/generation/models');
    if (!response.success) {
      throw new Error(response.error || '获取模型列表失败');
    }
    return response.data!;
  }

  // 切换模型
  static async switchModel(type: string, model: string): Promise<{ success: boolean; message: string }> {
    const response = await ApiService.post<{ success: boolean; message: string }>('/api/generation/switch-model', {
      type,
      model,
    });
    if (!response.success) {
      throw new Error(response.error || '切换模型失败');
    }
    return response.data!;
  }
}

export default GenerationService;