import React, { useState, useRef } from 'react';
import {
    FileText,
    Plus,
    Trash2,
    Edit3,
    Save,
    Download,
    Upload,
    Play,
    Pause,
    RotateCcw,
    Sparkles,
    Grid,
    List,
    Search,
    Eye,
    Copy,
    Settings,
    Clock,
    Image as ImageIcon,
    Video,
} from 'lucide-react';
import { GenerationService } from '@/services/generationService';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ErrorDisplay } from '@/components/ErrorBoundary';
import { StoryboardRequest, Storyboard, Scene, GenerationTask } from '@/types/generation';
import toast from 'react-hot-toast';

interface StoryboardSettings {
    style: 'cinematic' | 'documentary' | 'commercial' | 'artistic';
    duration: number;
    scene_count: number;
    include_camera_movements: boolean;
    include_lighting_notes: boolean;
    include_audio_cues: boolean;
}

const defaultSettings: StoryboardSettings = {
    style: 'cinematic',
    duration: 60,
    scene_count: 8,
    include_camera_movements: true,
    include_lighting_notes: true,
    include_audio_cues: true,
};

const styleOptions = [
    { value: 'cinematic', label: '电影风格', description: '适合故事片和短片' },
    { value: 'documentary', label: '纪录片风格', description: '适合纪录片和教育内容' },
    { value: 'commercial', label: '商业广告', description: '适合产品宣传和广告' },
    { value: 'artistic', label: '艺术创作', description: '适合实验性和艺术作品' },
];

interface Segment {
    time: string;
    scene: string;
    visual: string;
    story: string;
    dialogue: string;
}

interface StoryboardData {
    title: string;
    duration: string;
    segments: Segment[];
}

const showSettings = true;

const StoryboardPage: React.FC = () => {
    const [concept, setConcept] = useState('');
    const [settings, setSettings] = useState<StoryboardSettings>(defaultSettings);
    const [generating, setGenerating] = useState(false);
    // const [showSettings, setShowSettings] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
    const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStoryboard, setSelectedStoryboard] = useState<Storyboard | null>(null);
    const [editingScene, setEditingScene] = useState<Scene | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [storyboard, setStoryboard] = useState<StoryboardData | null>(null);
    const [showFullscreenView, setShowFullscreenView] = useState(false);

    const handleGenerate = async () => {
        setGenerating(true);
        // 模拟异步请求
        setTimeout(() => {
            fetch('/outputs/storyboard/story1.json')
                .then(res => res.json())
                .then(data => {
                    setStoryboard(data);
                    setGenerating(false);
                    toast.success('分镜脚本生成完成');
                })
                .catch(() => {
                    setGenerating(false);
                    toast.error('分镜脚本加载失败');
                });
        }, 10000);
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

    const handleDownloadStoryboard = (storyboard: Storyboard) => {
        const content = generateStoryboardText(storyboard);
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `storyboard-${storyboard.id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('分镜脚本下载成功');
    };

    const generateStoryboardText = (storyboard: Storyboard): string => {
        let content = `分镜脚本\n`;
        content += `标题: ${storyboard.title}\n`;
        content += `概念: ${storyboard.concept}\n`;
        content += `风格: ${storyboard.style}\n`;
        content += `总时长: ${storyboard.duration}秒\n`;
        content += `场景数量: ${storyboard.scenes.length}\n\n`;

        storyboard.scenes.forEach((scene, index) => {
            content += `=== 场景 ${index + 1} ===\n`;
            content += `时长: ${scene.duration}秒\n`;
            content += `描述: ${scene.description}\n`;

            if (scene.camera_movement) {
                content += `镜头运动: ${scene.camera_movement}\n`;
            }

            if (scene.lighting_notes) {
                content += `灯光说明: ${scene.lighting_notes}\n`;
            }

            if (scene.audio_cues) {
                content += `音频提示: ${scene.audio_cues}\n`;
            }

            content += `\n`;
        });

        return content;
    };

    const handleCopyStoryboard = (storyboard: Storyboard) => {
        const content = generateStoryboardText(storyboard);
        navigator.clipboard.writeText(content);
        toast.success('分镜脚本已复制到剪贴板');
    };

    const handleDeleteStoryboard = (storyboardId: string) => {
        setStoryboards(prev => prev.filter(sb => sb.id !== storyboardId));
        toast.success('分镜脚本已删除');
    };

    const handleEditScene = (scene: Scene) => {
        setEditingScene({ ...scene });
    };

    const handleSaveScene = () => {
        if (!editingScene || !selectedStoryboard) return;

        const updatedStoryboard = {
            ...selectedStoryboard,
            scenes: selectedStoryboard.scenes.map(scene =>
                scene.id === editingScene.id ? editingScene : scene
            )
        };

        setStoryboards(prev => prev.map(sb =>
            sb.id === selectedStoryboard.id ? updatedStoryboard : sb
        ));

        setSelectedStoryboard(updatedStoryboard);
        setEditingScene(null);
        toast.success('场景已更新');
    };

    const handleAddScene = () => {
        if (!selectedStoryboard) return;

        const newScene: Scene = {
            id: `scene-${Date.now()}`,
            sequence_number: selectedStoryboard.scenes.length + 1,
            duration: 5,
            description: '新场景描述',
            camera_movement: '',
            lighting_notes: '',
            audio_cues: '',
        };

        const updatedStoryboard = {
            ...selectedStoryboard,
            scenes: [...selectedStoryboard.scenes, newScene]
        };

        setStoryboards(prev => prev.map(sb =>
            sb.id === selectedStoryboard.id ? updatedStoryboard : sb
        ));

        setSelectedStoryboard(updatedStoryboard);
        toast.success('新场景已添加');
    };

    const handleDeleteScene = (sceneId: string) => {
        if (!selectedStoryboard) return;

        const updatedStoryboard = {
            ...selectedStoryboard,
            scenes: selectedStoryboard.scenes.filter(scene => scene.id !== sceneId)
        };

        setStoryboards(prev => prev.map(sb =>
            sb.id === selectedStoryboard.id ? updatedStoryboard : sb
        ));

        setSelectedStoryboard(updatedStoryboard);
        toast.success('场景已删除');
    };

    const filteredStoryboards = storyboards.filter(storyboard =>
        searchQuery === '' ||
        storyboard.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        storyboard.concept.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center space-x-3">
                        <FileText className="w-8 h-8 text-primary-600" />
                        <span>分镜创作</span>
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300 mt-2">
                        智能生成视频分镜脚本
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Generation Panel */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                        <div className="space-y-4">
                            {/* Concept Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    视频概念描述
                                </label>
                                <textarea
                                    value={concept}
                                    onChange={(e) => setConcept(e.target.value)}
                                    placeholder="描述您的视频概念，例如：一个关于环保主题的短片，讲述一个小女孩在城市中寻找绿色空间的故事，风格温馨感人，时长约60秒"
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                                    rows={4}
                                />
                            </div>

                            {/* Settings Panel */}
                            {showSettings && (
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                        分镜设置
                                    </h3>

                                    {/* Style Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            视频风格
                                        </label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {styleOptions.map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => setSettings(prev => ({ ...prev, style: option.value as any }))}
                                                    className={`p-3 text-left rounded-lg border transition-colors ${settings.style === option.value
                                                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                            : 'border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600'
                                                        }`}
                                                >
                                                    <div className="font-medium text-gray-900 dark:text-white">
                                                        {option.label}
                                                    </div>
                                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                                        {option.description}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Duration */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                视频时长 (秒): {settings.duration}
                                            </label>
                                            <input
                                                type="range"
                                                min="15"
                                                max="300"
                                                step="15"
                                                value={settings.duration}
                                                onChange={(e) => setSettings(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Scene Count */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                场景数量: {settings.scene_count}
                                            </label>
                                            <input
                                                type="range"
                                                min="3"
                                                max="20"
                                                value={settings.scene_count}
                                                onChange={(e) => setSettings(prev => ({ ...prev, scene_count: parseInt(e.target.value) }))}
                                                className="w-full"
                                            />
                                        </div>
                                    </div>

                                    {/* Options */}
                                    <div className="space-y-3">
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                id="camera-movements"
                                                checked={settings.include_camera_movements}
                                                onChange={(e) => setSettings(prev => ({ ...prev, include_camera_movements: e.target.checked }))}
                                                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                                            />
                                            <label htmlFor="camera-movements" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                                包含镜头运动说明
                                            </label>
                                        </div>

                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                id="lighting-notes"
                                                checked={settings.include_lighting_notes}
                                                onChange={(e) => setSettings(prev => ({ ...prev, include_lighting_notes: e.target.checked }))}
                                                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                                            />
                                            <label htmlFor="lighting-notes" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                                包含灯光说明
                                            </label>
                                        </div>

                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                id="audio-cues"
                                                checked={settings.include_audio_cues}
                                                onChange={(e) => setSettings(prev => ({ ...prev, include_audio_cues: e.target.checked }))}
                                                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                                            />
                                            <label htmlFor="audio-cues" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                                包含音频提示
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
                                        disabled={!concept.trim()}
                                        className="flex items-center space-x-2 px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                        <span>生成分镜脚本</span>
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
                </div>

                {/* Storyboard List */}
                <div className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索分镜脚本..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>

                    {/* Storyboards */}
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {/* Generated Storyboard from story1.json */}
                        {storyboard && (
                            <div
                                className={`bg-white dark:bg-gray-800 rounded-lg p-4 border cursor-pointer transition-colors ${!selectedStoryboard
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600'
                                    }`}
                                onClick={() => {
                                    setSelectedStoryboard(null);
                                    // 确保显示生成的分镜脚本
                                }}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-2">
                                            <h3 className="font-medium text-gray-900 dark:text-white line-clamp-1">
                                                {storyboard.title}
                                            </h3>
                                            <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                                                已生成
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                            AI生成的分镜脚本
                                        </p>
                                        <div className="flex items-center space-x-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                                            <span>{storyboard.segments.length} 分镜</span>
                                            <span>{storyboard.duration}</span>
                                            <span>AI生成</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-1 ml-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowFullscreenView(true);
                                            }}
                                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                            title="全屏查看"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const content = `分镜脚本\n标题: ${storyboard.title}\n总时长: ${storyboard.duration}\n\n${storyboard.segments.map((segment, index) =>
                                                    `=== 分镜 ${index + 1} ===\n时间: ${segment.time}\n场景: ${segment.scene}\n视觉: ${segment.visual}\n故事: ${segment.story}\n对话: ${segment.dialogue}\n`
                                                ).join('\n')}`;
                                                navigator.clipboard.writeText(content);
                                                toast.success('分镜脚本已复制到剪贴板');
                                            }}
                                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            title="复制"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const content = `分镜脚本\n标题: ${storyboard.title}\n总时长: ${storyboard.duration}\n\n${storyboard.segments.map((segment, index) =>
                                                    `=== 分镜 ${index + 1} ===\n时间: ${segment.time}\n场景: ${segment.scene}\n视觉: ${segment.visual}\n故事: ${segment.story}\n对话: ${segment.dialogue}\n`
                                                ).join('\n')}`;
                                                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `${storyboard.title}-storyboard.txt`;
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                                URL.revokeObjectURL(url);
                                                toast.success('分镜脚本下载成功');
                                            }}
                                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            title="下载"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setStoryboard(null);
                                                toast.success('分镜脚本已删除');
                                            }}
                                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                            title="删除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Existing Storyboards */}
                        {filteredStoryboards.map((storyboard) => (
                            <div
                                key={storyboard.id}
                                className={`bg-white dark:bg-gray-800 rounded-lg p-4 border cursor-pointer transition-colors ${selectedStoryboard?.id === storyboard.id
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600'
                                    }`}
                                onClick={() => setSelectedStoryboard(storyboard)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="font-medium text-gray-900 dark:text-white line-clamp-1">
                                            {storyboard.title}
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                            {storyboard.concept}
                                        </p>
                                        <div className="flex items-center space-x-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                                            <span>{storyboard.scenes.length} 场景</span>
                                            <span>{storyboard.duration}s</span>
                                            <span className="capitalize">{storyboard.style}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-1 ml-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopyStoryboard(storyboard);
                                            }}
                                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            title="复制"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownloadStoryboard(storyboard);
                                            }}
                                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            title="下载"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteStoryboard(storyboard.id);
                                            }}
                                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                            title="删除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Storyboard Detail */}
                {selectedStoryboard && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    {selectedStoryboard.title}
                                </h2>
                                <p className="text-gray-600 dark:text-gray-300 mt-1">
                                    {selectedStoryboard.concept}
                                </p>
                            </div>

                            <button
                                onClick={handleAddScene}
                                className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                <span>添加场景</span>
                            </button>
                        </div>

                        {/* Scenes */}
                        <div className="space-y-4">
                            {selectedStoryboard.scenes.map((scene, index) => (
                                <div key={scene.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-3 mb-2">
                                                <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm font-medium rounded">
                                                    场景 {index + 1}
                                                </span>
                                                <span className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                                                    <Clock className="w-4 h-4" />
                                                    <span>{scene.duration}秒</span>
                                                </span>
                                            </div>

                                            {editingScene?.id === scene.id ? (
                                                <div className="space-y-3">
                                                    <textarea
                                                        value={editingScene.description}
                                                        onChange={(e) => setEditingScene(prev => prev ? { ...prev, description: e.target.value } : null)}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                                                        rows={2}
                                                    />

                                                    {settings.include_camera_movements && (
                                                        <input
                                                            type="text"
                                                            value={editingScene.camera_movement || ''}
                                                            onChange={(e) => setEditingScene(prev => prev ? { ...prev, camera_movement: e.target.value } : null)}
                                                            placeholder="镜头运动"
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}

                                                    {settings.include_lighting_notes && (
                                                        <input
                                                            type="text"
                                                            value={editingScene.lighting_notes || ''}
                                                            onChange={(e) => setEditingScene(prev => prev ? { ...prev, lighting_notes: e.target.value } : null)}
                                                            placeholder="灯光说明"
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}

                                                    {settings.include_audio_cues && (
                                                        <input
                                                            type="text"
                                                            value={editingScene.audio_cues || ''}
                                                            onChange={(e) => setEditingScene(prev => prev ? { ...prev, audio_cues: e.target.value } : null)}
                                                            placeholder="音频提示"
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}

                                                    <div className="flex items-center space-x-2">
                                                        <button
                                                            onClick={handleSaveScene}
                                                            className="flex items-center space-x-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                                                        >
                                                            <Save className="w-3 h-3" />
                                                            <span>保存</span>
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingScene(null)}
                                                            className="flex items-center space-x-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors"
                                                        >
                                                            <span>取消</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <p className="text-gray-900 dark:text-white">
                                                        {scene.description}
                                                    </p>

                                                    {scene.camera_movement && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                                            <span className="font-medium">镜头运动:</span> {scene.camera_movement}
                                                        </p>
                                                    )}

                                                    {scene.lighting_notes && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                                            <span className="font-medium">灯光说明:</span> {scene.lighting_notes}
                                                        </p>
                                                    )}

                                                    {scene.audio_cues && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                                            <span className="font-medium">音频提示:</span> {scene.audio_cues}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {editingScene?.id !== scene.id && (
                                            <div className="flex items-center space-x-1 ml-4">
                                                <button
                                                    onClick={() => handleEditScene(scene)}
                                                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                    title="编辑"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteScene(scene.id)}
                                                    className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                                    title="删除"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Fullscreen Storyboard View Modal */}
                {showFullscreenView && storyboard && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        {/* Backdrop with blur */}
                        <div
                            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
                            onClick={() => setShowFullscreenView(false)}
                        />

                        {/* Modal Content */}
                        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-6xl max-h-[90vh] w-full mx-4 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {storyboard.title}
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        总时长: {storyboard.duration} | {storyboard.segments.length} 个分镜
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowFullscreenView(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    <span className="sr-only">关闭</span>
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                                <div className="space-y-6">
                                    {storyboard.segments.map((segment, index) => (
                                        <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                                            <div className="flex items-center space-x-3 mb-4">
                                                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                                        {segment.time}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {segment.scene}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                                                        <ImageIcon className="w-4 h-4 mr-2" />
                                                        视觉效果
                                                    </h4>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded">
                                                        {segment.visual}
                                                    </p>
                                                </div>

                                                <div>
                                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                                                        <FileText className="w-4 h-4 mr-2" />
                                                        故事情节
                                                    </h4>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded">
                                                        {segment.story}
                                                    </p>
                                                </div>
                                            </div>

                                            {segment.dialogue && (
                                                <div className="mt-4">
                                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                                                        <Video className="w-4 h-4 mr-2" />
                                                        对话/旁白
                                                    </h4>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded italic">
                                                        "{segment.dialogue}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoryboardPage;
