import React, { useState, useEffect, useRef } from 'react';
import {
  Image,
  Wand2,
  Download,
  Copy,
  Trash2,
  Eye,
  Pause,
  Sparkles,
  Grid,
  List,
  Search,
} from 'lucide-react';
import { GenerationService } from '@/services/generationService';
import LoadingSpinner from '@/components/LoadingSpinner';
import ImagePreviewer from '@/components/ImagePreview';

import { TextToImageRequest, GeneratedImage, GenerationTask } from '@/types/generation';
import toast from 'react-hot-toast';

// API基础URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

// 构建完整的图像URL
const getFullImageUrl = (relativeUrl: string): string => {
  if (relativeUrl.startsWith('http')) {
    return relativeUrl; // 已经是完整URL
  }
  return `${API_BASE_URL}${relativeUrl}`;
};

interface GenerationSettings {
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed: number;
  batch_size: number;
  negative_prompt: string;
}

const defaultSettings: GenerationSettings = {
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7.5,
  seed: -1,
  batch_size: 1,
  negative_prompt: 'worst quality, normal quality, low quality, low res, blurry, distortion, text, watermark, logo, banner, extra digits, cropped, jpeg artifacts, signature, username, error, sketch, duplicate, ugly, monochrome, horror, geometry, mutation, disgusting, bad anatomy, bad proportions, bad quality, deformed, disconnected limbs, out of frame, out of focus, dehydrated, disfigured, extra arms, extra limbs, extra hands, fused fingers, gross proportions, long neck, jpeg, malformed limbs, mutated, mutated hands, mutated limbs, missing arms, missing fingers, picture frame, poorly drawn hands, poorly drawn face, collage, pixel, pixelated, grainy, color aberration, amputee, autograph, bad illustration, beyond the borders, blank background, body out of frame, boring background, branding, cut off, dismembered, disproportioned, distorted, draft, duplicated features, extra fingers, extra legs, fault, flaw, grains, hazy, identifying mark, improper scale, incorrect physiology, incorrect ratio, indistinct, kitsch, low resolution, macabre, malformed, mark, misshapen, missing hands, missing legs, mistake, morbid, mutilated, off-screen, outside the picture, poorly drawn feet, printed words, render, repellent, replicate, reproduce, revolting dimensions, script, shortened, sign, split image, squint, storyboard, tiling, trimmed, unfocused, unattractive, unnatural pose, unreal engine, unsightly, written language',
};

const presetSizes = [
  { label: '正方形', width: 512, height: 512 },
  { label: '横屏', width: 768, height: 512 },
  { label: '竖屏', width: 512, height: 768 },
  { label: '宽屏', width: 1024, height: 576 },
];

const showSettings = true;
const TextToImagePage: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<GenerationSettings>(defaultSettings);
  const [generating, setGenerating] = useState(false);
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  // const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const progressCleanupRef = useRef<(() => void) | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 清理进度监听
  useEffect(() => {
    return () => {
      if (progressCleanupRef.current) {
        progressCleanupRef.current();
      }
    };

  const handleCancelGeneration = () => {
    if (progressCleanupRef.current) {
      progressCleanupRef.current();
      progressCleanupRef.current = null;
    }
    setGenerating(false);
    setProgress(0);
    setProgressStatus('');
    setCurrentTask(null);
    toast.success('生成已取消');
  };
  }, []);


  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('请输入图像描述');
      return;
    }

    try {
      setGenerating(true);
      setProgress(0);
      setProgressStatus('正在启动生成任务...');
      
      const request: TextToImageRequest = {
        prompt: prompt.trim(),
        negative_prompt: settings.negative_prompt,
        width: settings.width,
        height: settings.height,
        num_inference_steps: settings.steps,
        steps: settings.steps,
        guidance_scale: settings.cfg_scale,
        cfg_scale: settings.cfg_scale,
        num_images_per_prompt: settings.batch_size,
        batch_size: settings.batch_size,
        seed: settings.seed === -1 ? undefined : settings.seed,
      };

      const response = await GenerationService.generateTextToImage(request);
      
      // 清理之前的进度监听
      if (progressCleanupRef.current) {
        progressCleanupRef.current();
      }
      
      // 开始监听进度
      progressCleanupRef.current = GenerationService.listenToProgress(
        response.task_id,
        (task) => {
          setProgress(task.progress || 0);
          setCurrentTask(task);
          
          switch (task.status) {
            case 'pending':
              setProgressStatus('任务排队中...');
              break;
            case 'processing':
              setProgressStatus('正在生成图像...');
              break;
            case 'completed':
              setProgressStatus('生成完成！');
              if (task.result?.images) {
                setGeneratedImages(prev => [...prev, ...task.result.images]);
                toast.success(`成功生成 ${task.result.images.length} 张图像`);
              }
              setGenerating(false);
              setProgress(100);
              break;
            case 'failed':
              setProgressStatus('生成失败');
              toast.error(task.error || '生成失败');
              setGenerating(false);
              break;
          }
        },
        (error) => {
          console.error('Progress listening error:', error);
          setProgressStatus('连接中断');
          toast.error('进度监听失败: ' + error.message);
          setGenerating(false);
        },
        () => {
          // 完成回调
          progressCleanupRef.current = null;
        }
      );
      
    } catch (err) {
      setGenerating(false);
      setProgressStatus('');
      const errorMessage = err instanceof Error ? err.message : '生成失败';
      toast.error(errorMessage);
    }
  };

  const handleOptimizePrompt = async () => {
    if (!prompt.trim()) {
      toast.error('请输入要优化的描述');
      return;
    }

    try {
      setOptimizingPrompt(true);
      const response = await GenerationService.optimizePrompt({
        prompt: prompt.trim(),
        type: 'text_to_image',
        style: 'photorealistic',
        enhance_details: true,
      });
      setPrompt(response.optimized_prompt);
      toast.success('Prompt优化完成');
    } catch (err) {
      toast.error('Prompt优化失败');
    } finally {
      setOptimizingPrompt(false);
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

  const handleDownloadImage = async (image: GeneratedImage) => {
    try {
      const blob = await GenerationService.downloadResult(image.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-image-${image.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('图像下载成功');
    } catch (err) {
      toast.error('下载失败');
    }
  };

  const handleCopyPrompt = (imagePrompt: string) => {
    navigator.clipboard.writeText(imagePrompt);
    toast.success('Prompt已复制到剪贴板');
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      await GenerationService.deleteResult(imageId);
      setGeneratedImages(prev => prev.filter(img => img.id !== imageId));
      toast.success('图像已删除');
    } catch (err) {
      toast.error('删除失败');
    }
  };

  const handleBatchDownload = async () => {
    if (selectedImages.size === 0) {
      toast.error('请选择要下载的图像');
      return;
    }

    for (const imageId of selectedImages) {
      const image = generatedImages.find(img => img.id === imageId);
      if (image) {
        await handleDownloadImage(image);
      }
    }
    setSelectedImages(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedImages.size === 0) {
      toast.error('请选择要删除的图像');
      return;
    }

    try {
      for (const imageId of selectedImages) {
        await GenerationService.deleteResult(imageId);
      }
      setGeneratedImages(prev => prev.filter(img => !selectedImages.has(img.id)));
      setSelectedImages(new Set());
      toast.success(`已删除 ${selectedImages.size} 张图像`);
    } catch (err) {
      toast.error('批量删除失败');
    }
  };
  
  const handlePreviewImage = (image: GeneratedImage) => {
    const imgUrl = getFullImageUrl(image.url);
    setPreviewUrl(imgUrl);
  };
    
  const filteredImages = generatedImages.filter(image =>
    searchQuery === '' || 
    image.prompt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center space-x-3">
            <Image className="w-8 h-8 text-primary-600" />
            <span>文生图</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            通过文字描述生成精美图像
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
        <div className="space-y-4">
          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              图像描述 (Prompt)
            </label>
            <div className="flex space-x-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述您想要生成的图像，例如：一只可爱的小猫坐在花园里，阳光明媚，高质量，8K分辨率"
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                rows={3}
              />
              <button
                onClick={handleOptimizePrompt}
                disabled={optimizingPrompt || !prompt.trim()}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {optimizingPrompt ? (
                  <LoadingSpinner size="sm" color="white" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                <span>优化</span>
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                生成设置
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Size Presets */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    尺寸预设
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {presetSizes.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => setSettings(prev => ({ ...prev, width: preset.width, height: preset.height }))}
                        className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                          settings.width === preset.width && settings.height === preset.height
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Custom Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    自定义尺寸
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      min="256"
                      max="1024"
                      step="64"
                      value={settings.width}
                      onChange={(e) => setSettings(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                      className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                    <span className="text-gray-500 dark:text-gray-400">×</span>
                    <input
                      type="number"
                      min="256"
                      max="1024"
                      step="64"
                      value={settings.height}
                      onChange={(e) => setSettings(prev => ({ ...prev, height: parseInt(e.target.value) }))}
                      className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
                
                {/* Steps */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    采样步数: {settings.steps}
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    value={settings.steps}
                    onChange={(e) => setSettings(prev => ({ ...prev, steps: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                
                {/* CFG Scale */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    CFG Scale: {settings.cfg_scale}
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
                
                {/* Batch Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    批量生成数量
                  </label>
                  <select
                    value={settings.batch_size}
                    onChange={(e) => setSettings(prev => ({ ...prev, batch_size: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value={1}>1张</option>
                    <option value={2}>2张</option>
                    <option value={4}>4张</option>
                    <option value={8}>8张</option>
                  </select>
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
              </div>
              
              {/* Negative Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  负面描述 (Negative Prompt)
                </label>
                <textarea
                  value={settings.negative_prompt}
                  placeholder = "worst quality, normal quality, low quality, low res, blurry, distortion, text, watermark, logo, banner, extra digits, cropped, jpeg artifacts, signature, username, error, sketch, duplicate, ugly, monochrome, horror, geometry, mutation, disgusting, bad anatomy, bad proportions, bad quality, deformed, disconnected limbs, out of frame, out of focus, dehydrated, disfigured, extra arms, extra limbs, extra hands, fused fingers, gross proportions, long neck, jpeg, malformed limbs, mutated, mutated hands, mutated limbs, missing arms, missing fingers, picture frame, poorly drawn hands, poorly drawn face, collage, pixel, pixelated, grainy, color aberration, amputee, autograph, bad illustration, beyond the borders, blank background, body out of frame, boring background, branding, cut off, dismembered, disproportioned, distorted, draft, duplicated features, extra fingers, extra legs, fault, flaw, grains, hazy, identifying mark, improper scale, incorrect physiology, incorrect ratio, indistinct, kitsch, low resolution, macabre, malformed, mark, misshapen, missing hands, missing legs, mistake, morbid, mutilated, off-screen, outside the picture, poorly drawn feet, printed words, render, repellent, replicate, reproduce, revolting dimensions, script, shortened, sign, split image, squint, storyboard, tiling, trimmed, unfocused, unattractive, unnatural pose, unreal engine, unsightly, written language"
                  onChange={(e) => setSettings(prev => ({ ...prev, negative_prompt: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={2}
                />
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
                disabled={!prompt.trim()}
                className="flex items-center space-x-2 px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                <Sparkles className="w-5 h-5" />
                <span>开始生成</span>
              </button>
            )}
          </div>

          {/* Generation Progress */}
          {generating && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  生成进度
                </span>
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  {progress}%
                </span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {progressStatus && (
                 <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                   {progressStatus}
                 </p>
               )}
               {prompt && (
                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                   正在生成: {prompt}
                 </p>
               )}
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {generatedImages.length > 0 && (
        <div className="space-y-4">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              生成结果 ({filteredImages.length})
            </h2>
            
            <div className="flex items-center space-x-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索图像..."
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              {/* Batch Actions */}
              {selectedImages.size > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleBatchDownload}
                    className="flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>下载 ({selectedImages.size})</span>
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>删除 ({selectedImages.size})</span>
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

          {/* Images Grid/List */}
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
            {filteredImages.map((image) => (
              <div
                key={image.id}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden group ${
                  viewMode === 'list' ? 'flex space-x-4' : ''
                }`}
              >
                {/* Image */}
                <div className={`relative ${viewMode === 'list' ? 'w-32 h-32 flex-shrink-0' : 'aspect-square'}`}>
                  <img
                    src={getFullImageUrl(image.url)}
                    alt={image.prompt}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Selection Checkbox */}
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selectedImages.has(image.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedImages);
                        if (e.target.checked) {
                          newSelected.add(image.id);
                        } else {
                          newSelected.delete(image.id);
                        }
                        setSelectedImages(newSelected);
                      }}
                      className="w-4 h-4 text-primary-600 bg-white border-gray-300 rounded focus:ring-primary-500"
                    />
                  </div>
                  
                  {/* Overlay Actions */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="flex space-x-2">
                        <button
                        onClick={() => handlePreviewImage(image)}
                        className="p-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                        title="预览"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadImage(image)}
                        className="p-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                        title="下载"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCopyPrompt(image.prompt)}
                        className="p-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                        title="复制Prompt"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteImage(image.id)}
                        className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Image Info */}
                <div className={`p-4 ${viewMode === 'list' ? 'flex-1' : ''}`}>
                  <p className={`text-gray-600 dark:text-gray-300 text-sm ${viewMode === 'list' ? 'line-clamp-3' : 'line-clamp-2'}`}>
                    {image.prompt}
                  </p>
                  
                  {image.metadata && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{image.metadata.width}×{image.metadata.height}</span>
                      <span>Steps: {image.metadata.steps}</span>
                      <span>CFG: {image.metadata.cfg_scale}</span>
                      {image.metadata.seed && <span>Seed: {image.metadata.seed}</span>}
                    </div>
                  )}
                  
                  <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    {new Date(image.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ImagePreviewer url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

export default TextToImagePage;

