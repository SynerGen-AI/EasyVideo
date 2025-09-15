// Generation related types

export interface TextToImageRequest {
    prompt: string;
    negative_prompt?: string;
    width: number;
    height: number;
    num_inference_steps: number;
    steps: number;
    guidance_scale: number;
    cfg_scale: number;
    num_images_per_prompt: number;
    batch_size: number;
    seed?: number;
    scheduler?: string;
    model?: string;
  }
  
  export interface ImageToVideoRequest {
    image_path: string;
    motion_prompt: string;
    num_frames: number;
    fps: number;
    motion_strength: number;
    cfg_scale: number;
    num_inference_steps: number;
    seed?: number;
    model?: string;
    negative_prompt?: string;
    tiled?: boolean;
    task_id: string;
    output_dir: string;
  }
  
  export interface StoryboardRequest {
    concept: string;
    style: 'cinematic' | 'documentary' | 'commercial' | 'artistic';
    duration: number;
    scene_count: number;
    include_camera_movements: boolean;
    include_lighting_notes: boolean;
    include_audio_cues: boolean;
  }
  
  export interface GenerationTask {
    id: string;
    type: 'text_to_image' | 'image_to_video' | 'storyboard';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    created_at: string;
    updated_at: string;
    started_at?: string;
    completed_at?: string;
    error?: string;
    status_message?: string;
    request: TextToImageRequest | ImageToVideoRequest | StoryboardRequest;
    result?: GenerationResult;
  }
  
  export interface GenerationResult {
    task_id: string;
    type: 'text_to_image' | 'image_to_video' | 'storyboard';
    images?: GeneratedImage[];
    videos?: GeneratedVideo[];
    storyboard?: Storyboard;
    metadata: {
      generation_time: number;
      model_used: string;
      parameters: Record<string, any>;
    };
  }
  
  export interface GeneratedImage {
    id: string;
    url: string;
    thumbnail_url: string;
    filename: string;
    width: number;
    height: number;
    file_size: number;
    prompt: string;
    negative_prompt?: string;
    seed: number;
    created_at: string;
    metadata: {
      model: string;
      steps: number;
      guidance_scale: number;
      scheduler: string;
      width: number;
      height: number;
      cfg_scale: number;
      seed?: number;
    };
  }
  
  export interface GeneratedVideo {
    id: string;
    url: string;
    thumbnail_url: string;
    duration: number;
    fps: number;
    width: number;
    height: number;
    motion_prompt: string;
    file_size: number;
    created_at: string;
  }
  
  export interface Storyboard {
    id: string;
    title: string;
    concept: string;
    style: string;
    duration: number;
    scenes: Scene[];
    created_at: string;
    updated_at: string;
  }
  
  export interface Scene {
    id: string;
    sequence_number: number;
    duration: number;
    description: string;
    camera_movement?: string;
    lighting_notes?: string;
    audio_cues?: string;
  }
  
  export interface GenerationHistory {
    total: number;
    items: GenerationTask[];
    page: number;
    limit: number;
    has_next: boolean;
    has_prev: boolean;
  }
  
  export interface GenerationStats {
    total_generations: number;
    successful_generations: number;
    failed_generations: number;
    total_images: number;
    total_videos: number;
    total_storyboards: number;
    average_generation_time: number;
    most_used_model: string;
    storage_used: number;
  }
  
  export interface ModelInfo {
    id: string;
    name: string;
    type: 'text_to_image' | 'image_to_video' | 'storyboard';
    description: string;
    version: string;
    is_loaded: boolean;
    is_available: boolean;
    memory_usage?: number;
    supported_features: string[];
    default_parameters: Record<string, any>;
  }
  
  export interface GenerationQueue {
    pending_tasks: number;
    running_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    estimated_wait_time: number;
    is_paused: boolean;
  }
  
  export interface PromptTemplate {
    id: string;
    name: string;
    description: string;
    type: 'text_to_image' | 'image_to_video' | 'storyboard';
    template: string;
    variables: string[];
    tags: string[];
    is_public: boolean;
    created_at: string;
    updated_at: string;
    usage_count: number;
  }
  
  export interface OptimizedPrompt {
    original: string;
    optimized: string;
    improvements: string[];
    confidence: number;
  }
  
  export interface BatchGenerationRequest {
    type: 'text_to_image' | 'image_to_video';
    prompts: string[];
    base_parameters: TextToImageRequest | ImageToVideoRequest;
    variations: {
      seeds?: number[];
      guidance_scales?: number[];
      steps?: number[];
    };
  }
  
  export interface BatchGenerationResult {
    batch_id: string;
    total_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    results: GenerationResult[];
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    created_at: string;
    completed_at?: string;
  }
  
  // Response types for API
  export interface TextToImageResponse {
    task_id: string;
    task: GenerationTask;
    status: 'pending' | 'running' | 'completed' | 'failed';
    images?: GeneratedImage[];
    message?: string;
  }
  
  export interface ImageToVideoResponse {
    task_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    videos?: GeneratedVideo[];
    message?: string;
  }
  
  export interface StoryboardResponse {
    task_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    storyboard?: Storyboard;
    message?: string;
  }
  
  export interface PromptOptimizationRequest {
    prompt: string;
    type: 'text_to_image' | 'image_to_video' | 'storyboard';
    style?: string;
    enhance_creativity?: boolean;
    enhance_details?: boolean;
  }
  
  export interface PromptOptimizationResponse {
    original_prompt: string;
    optimized_prompt: string;
    improvements: string[];
    confidence: number;
    suggestions?: string[];
  }
  
  export interface BatchGenerationResponse {
    batch_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    total_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    results: GenerationResult[];
    message?: string;
  }