import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Video,
  Upload,
  Play,
  Pause,
  Download,
  Trash2,
  Settings,
  Image as ImageIcon,
  FileVideo,
  RotateCcw,
  Sparkles,
  Grid,
  List,
  Search,
  X,
  Eye,
} from 'lucide-react';
import { GenerationService } from '@/services/generationService';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ErrorDisplay } from '@/components/ErrorBoundary';
import { ImageToVideoRequest, GeneratedVideo, GenerationTask } from '@/types/generation';
import toast from 'react-hot-toast';

interface VideoSettings {
  duration: number;
  fps: number;
  motion_strength: number;
  seed: number;
  negative_prompt: string;
  tiled: boolean;
  num_inference_steps: number;
  cfg_scale: number;
}

const defaultSettings: VideoSettings = {
  duration: 3,
  fps: 24,
  motion_strength: 0.5,
  seed: -1,
  negative_prompt: "static, blurry, low quality",
  tiled: true,
  num_inference_steps: 20,
  cfg_scale: 7.5,
};

const presetDurations = [
  { label: '2秒', value: 2 },
  { label: '3秒', value: 3 },
  { label: '5秒', value: 5 },
  { label: '10秒', value: 10 },
];

const showSettings = true;

const exampleVideo: GeneratedVideo = {
  id: "video_001",
  url: "/outputs/videos/video_20250823_153004_video_1755934153715_4eapnf9er.mp4",
  thumbnail_url: "/images/test.jpg",
  filename: "FLFKJ_00021.mp4",
  duration: 12.5,      // 秒
  fps: 30,
  width: 1920,
  height: 1080,
  file_size: 25_000_000, // 字节
  source_image_url: "/home/rogers/Documents/project/EasyVideo/test.jpg",
  motion_prompt: "A cat walking in a park, sunny day",
  seed: 12345,
  created_at: "2025-08-20T17:00:00Z",
  metadata: {
    model: "StableMotion-v1",
    motion_strength: 0.8,
    guidance_scale: 7.5,
    steps: 50,
  },
};

const ImageToVideoPage: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [motionPrompt, setMotionPrompt] = useState('');
  const [settings, setSettings] = useState<VideoSettings>(defaultSettings);
  //网页加载时读缓存
  useEffect(() => {
    const savedMotionPrompt = localStorage.getItem('MotionPrompt');
    if (savedMotionPrompt) {
      setMotionPrompt(savedMotionPrompt);
    }
    const savedNegativePrompt = localStorage.getItem('NegativePrompt');
    if (savedNegativePrompt) {
      setSettings(prev => ({...prev, negative_prompt: savedNegativePrompt}));
    }
  }, []);
  //输入框内容变化时写缓存
  const onChange_Pos = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMotionPrompt(e.target.value);
    localStorage.setItem('MotionPrompt', e.target.value);
  };
  const onChange_Neg = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSettings(prev => ({...prev, negative_prompt: e.target.value}));
    localStorage.setItem('NegativePrompt', e.target.value);
  };

  const [generating, setGenerating] = useState(false);
  // const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([exampleVideo]);
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pollTimeoutRef = useRef<number | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图像文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('图像文件大小不能超过10MB');
      return;
    }

    setSelectedImage(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleGenerate = async () => {
    if (!selectedImage) {
      toast.error('请先选择图像');
      return;
    }

    try {
      setGenerating(true);
      
      // 上传图像
      const uploadResponse = await GenerationService.uploadImageForVideo(selectedImage);
      
      const taskId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const request: ImageToVideoRequest = {
        image_path: uploadResponse.image_path,
        motion_prompt: motionPrompt.trim() || '',
        duration: settings.duration,
        fps: settings.fps,
        motion_strength: settings.motion_strength,
        seed: settings.seed === -1 ? undefined : settings.seed,
        cfg_scale: settings.cfg_scale,
        num_inference_steps: settings.num_inference_steps,
        negative_prompt: settings.negative_prompt.trim() || undefined,
        tiled: settings.tiled,
        task_id: taskId,
        output_dir: 'videos'
      };

      const response = await GenerationService.generateImageToVideo(request);
      
      // 使用SSE监听进度
      const eventSource = new EventSource(`/api/generation/progress/${response.task_id}`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.error) {
            console.error('Task error:', data.error);
            eventSource.close();
            setGenerating(false);
            toast.error('视频生成失败');
            return;
          }
          
          setCurrentTask(data);
          
          if (data.status === 'completed') {
            eventSource.close();
            setGenerating(false);
            
            if (data.result?.videos) {
              setGeneratedVideos(prev => [...prev, ...data.result.videos]);
              toast.success(`成功生成 ${data.result.videos.length} 个视频`);
            }
          } else if (data.status === 'failed') {
            eventSource.close();
            setGenerating(false);
            toast.error(data.error || '生成失败');
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err);
          eventSource.close();
          setGenerating(false);
          toast.error('获取任务状态失败');
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        setGenerating(false);
        toast.error('连接中断，请重试');
      };
      
    } catch (err) {
      setGenerating(false);
      const errorMessage = err instanceof Error ? err.message : '生成失败';
      toast.error(errorMessage);
    }
  };

  const handleCancelGeneration = async () => {
    if (currentTask) {
      try {
        await GenerationService.cancelTask(currentTask.id);
        setGenerating(false);
        setCurrentTask(null);
        toast.success('生成已取消');
      } catch (err) {
        toast.error('取消失败');
      }
    }
  };

  const handleOptimizePrompt = async () => {
    if (!motionPrompt.trim()) {
      toast.error('请先输入运动描述');
      return;
    }

    try {
      setOptimizingPrompt(true);
      const optimizedPrompt = await GenerationService.optimizePrompt({
        prompt: motionPrompt,
        type: 'image_to_video'
      });
      setMotionPrompt(optimizedPrompt.optimized_prompt);
      toast.success('提示词优化完成');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '优化失败';
      toast.error(errorMessage);
    } finally {
      setOptimizingPrompt(false);
    }
  };

  const handleDownloadVideo = async (video: GeneratedVideo) => {
    try {
      const blob = await GenerationService.downloadResult(video.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-video-${video.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('视频下载成功');
    } catch (err) {
      toast.error('下载失败');
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    try {
      await GenerationService.deleteResult(videoId);
      setGeneratedVideos(prev => prev.filter(video => video.id !== videoId));
      toast.success('视频已删除');
    } catch (err) {
      toast.error('删除失败');
    }
  };

  const handleBatchDownload = async () => {
    if (selectedVideos.size === 0) {
      toast.error('请选择要下载的视频');
      return;
    }

    for (const videoId of selectedVideos) {
      const video = generatedVideos.find(v => v.id === videoId);
      if (video) {
        await handleDownloadVideo(video);
      }
    }
    setSelectedVideos(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedVideos.size === 0) {
      toast.error('请选择要删除的视频');
      return;
    }

    try {
      for (const videoId of selectedVideos) {
        await GenerationService.deleteResult(videoId);
      }
      setGeneratedVideos(prev => prev.filter(video => !selectedVideos.has(video.id)));
      setSelectedVideos(new Set());
      toast.success(`已删除 ${selectedVideos.size} 个视频`);
    } catch (err) {
      toast.error('批量删除失败');
    }
  };

  const filteredVideos = generatedVideos.filter(video =>
    searchQuery === '' || 
    (video.motion_prompt && video.motion_prompt.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handlePreviewVideo = (video: GeneratedVideo) => {
    const videoUrl = video.url;
    const videoWindow = window.open('', '_blank');
    if (videoWindow) {
      videoWindow.document.write(`
        <html>
          <head>
            <title>视频预览</title>   
          </head>
          <body style="margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #000;">
            <video controls autoplay style="max-width: 100%; max-height: 100%;">
              <source src="${videoUrl}" type="video/mp4">
              您的浏览器不支持视频播放
            </video>
          </body>
        </html>
      `);
      videoWindow.document.close();
    } else {
      toast.error('无法打开新窗口，请检查浏览器设置');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center space-x-3">
            <Video className="w-8 h-8 text-primary-600" />
            <span>图生视频</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            将静态图像转换为动态视频
          </p>
        </div>
        
        {/* <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              showSettings
                ? 'bg-primary-600 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>设置</span>
          </button>
        </div> */}
      </div>

      {/* Generation Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="space-y-6">
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              选择图像
            </label>
            
            {!selectedImage ? (
              <div
                ref={dragRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      拖拽图像到此处或点击选择
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                      支持 JPG、PNG、WebP 格式，最大 10MB
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="relative w-32 h-32 flex-shrink-0">
                    <img
                      src={imagePreview!}
                      alt="Selected"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <div className="absolute top-2 right-2">
                      <button
                        onClick={() => {
                          setSelectedImage(null);
                          setImagePreview(null);
                        }}
                        className="p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {selectedImage.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      大小: {(selectedImage.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      类型: {selectedImage.type}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Motion Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                运动描述 (可选)
              </label>
              <button
                onClick={handleOptimizePrompt}
                disabled={optimizingPrompt || !motionPrompt.trim()}
                className="flex items-center space-x-1 px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {optimizingPrompt ? (
                  <LoadingSpinner size="sm" color="white" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                <span>{optimizingPrompt ? '优化中...' : 'AI优化'}</span>
              </button>
            </div>
            <span
              className="block text-xs text-gray-500 dark:text-gray-400 mb-2 select-all cursor-pointer"
              onClick={e => {
                const text = (e.target as HTMLElement).innerText;
                navigator.clipboard.writeText(text);
              }}
              title="点击复制"
            >
              描述您想要生成的图像，例如：一只可爱的小猫坐在花园里，阳光明媚，高质量，8K分辨率
            </span>
            <textarea
              value={motionPrompt}
              onChange={onChange_Pos}
              // placeholder="描述您希望图像中的运动效果，例如：轻柔的风吹动头发，水面波纹荡漾，云朵缓慢飘动"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              rows={3}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              💡 点击"AI优化"按钮可以让AI帮您改进运动描述，生成更好的视频效果
            </p>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                视频设置
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Duration Presets */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    视频时长
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {presetDurations.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => setSettings(prev => ({ ...prev, duration: preset.value }))}
                        className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                          settings.duration === preset.value
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* FPS */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    帧率 (FPS)
                  </label>
                  <select
                    value={settings.fps}
                    onChange={(e) => setSettings(prev => ({ ...prev, fps: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value={12}>12 FPS</option>
                    <option value={24}>24 FPS</option>
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </div>
                
                {/* Motion Strength */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    运动强度: {settings.motion_strength}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={settings.motion_strength}
                    onChange={(e) => setSettings(prev => ({ ...prev, motion_strength: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* CFG Scale */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    引导强度: {settings.cfg_scale}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={settings.cfg_scale}
                    onChange={(e) => setSettings(prev => ({ ...prev, cfg_scale: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* Inference Steps */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    推理步数: {settings.num_inference_steps}
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    value={settings.num_inference_steps}
                    onChange={(e) => setSettings(prev => ({ ...prev, num_inference_steps: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* Seed */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    随机种子 (-1为随机)
                  </label>
                  <input
                    type="number"
                    value={settings.seed}
                    onChange={(e) => setSettings(prev => ({ ...prev, seed: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                
                {/* Negative Prompt */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    负面提示词
                  </label>
                  <textarea
                    value={settings.negative_prompt}
                    // onChange={(e) => setSettings(prev => ({ ...prev, negative_prompt: e.target.value }))}
                    onChange={onChange_Neg}
                    placeholder="描述不希望出现在视频中的内容..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                    rows={2}
                  />
                </div>
                
                {/* Tiled */}
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.tiled}
                      onChange={(e) => setSettings(prev => ({ ...prev, tiled: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      启用平铺模式 (减少内存使用)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex justify-center">
            {generating ? (
              <button
                onClick={handleCancelGeneration}
                className="flex items-center space-x-2 px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Pause className="w-5 h-5" />
                <span>取消生成</span>
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!selectedImage}
                className="flex items-center space-x-2 px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                <Sparkles className="w-5 h-5" />
                <span>开始生成</span>
              </button>
            )}
          </div>

          {/* Generation Progress */}
          {generating && currentTask && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  生成进度
                </span>
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  {currentTask.progress}%
                </span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${currentTask.progress}%` }}
                />
              </div>
              {currentTask.status_message && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                  {currentTask.status_message}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {generatedVideos.length > 0 && (
        <div className="space-y-4">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              生成结果 ({filteredVideos.length})
            </h2>
            
            <div className="flex items-center space-x-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索视频..."
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              {/* Batch Actions */}
              {selectedVideos.size > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleBatchDownload}
                    className="flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>下载 ({selectedVideos.size})</span>
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>删除 ({selectedVideos.size})</span>
                  </button>
                </div>
              )}
              
              {/* View Mode */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Videos Grid/List */}
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {filteredVideos.map((video) => (
              <div
                key={video.id}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden group ${
                  viewMode === 'list' ? 'flex space-x-4' : ''
                }`}
              >
                {/* Video */}
                <div className={`relative ${viewMode === 'list' ? 'w-48 h-32 flex-shrink-0' : 'aspect-video'}`}>
                  <video
                    src={video.url}
                    className="w-full h-full object-cover"
                    controls
                    poster={video.thumbnail_url}
                  />
                  
                  {/* Selection Checkbox */}
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selectedVideos.has(video.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedVideos);
                        if (e.target.checked) {
                          newSelected.add(video.id);
                        } else {
                          newSelected.delete(video.id);
                        }
                        setSelectedVideos(newSelected);
                      }}
                      className="w-4 h-4 text-primary-600 bg-white border-gray-300 rounded focus:ring-primary-500"
                    />
                  </div>
                  
                  {/* Overlay Actions */}
                  {/* <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDownloadVideo(video)}
                        className="p-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                        title="下载"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteVideo(video.id)}
                        className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div> */}
                </div>
                
                {/* Video Info */}
                <div className={`p-4 ${viewMode === 'list' ? 'flex-1' : ''}`}>
                  {video.motion_prompt && (
                    <p className={`text-gray-600 dark:text-gray-300 text-sm ${viewMode === 'list' ? 'line-clamp-2' : 'line-clamp-1'}`}>
                      {video.motion_prompt}
                    </p>
                  )}
                  
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{video.duration}s</span>
                    <span>{video.fps} FPS</span>
                    <span>{video.width}×{video.height}</span>
                    {video.file_size && (
                      <span>{(video.file_size / 1024 / 1024).toFixed(1)} MB</span>
                    )}
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    {new Date(video.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageToVideoPage;