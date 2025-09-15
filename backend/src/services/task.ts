import fs from 'fs-extra';
import { JSON_PATH, JSON_VIDEO_PATH, JSON_IMAGE_PATH } from '../config/storage_config';

export interface Task {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  type: string;
  progress: number;
  prompt?: string;
  result?: any;
  error?: string;
  created_at: string;
  updated_at: string;
}

export class TasksPool {
  private tasks: Map<string, Task> = new Map();

  constructor(jsonPath: string = JSON_PATH) {
    this.tasks = TasksPool.initializeTaskMap(jsonPath);
  }

  // 初始化任务池
  static initializeTaskMap(jsonPath: string): Map<string, Task> {
    if (fs.existsSync(jsonPath)) {
      const data = fs.readFileSync(jsonPath, 'utf8');
      if (data.trim().length === 0) return new Map(); // 空文件
      const obj = JSON.parse(data);
      console.log("Tasks pool: initialize successfully read from JSON");
      return new Map(Object.entries(obj) as [string, Task][]); // 转 Map
    }
    return new Map();
  }

  // 保存某个任务
  static saveTaskById(tasks: Map<string, Task>, taskId: string, jsonPath: string = JSON_PATH) {
    if (!tasks.has(taskId)) {
      console.warn(`Tasks pool: TaskId ${taskId} 不存在`);
      return;
    }

    let jsonData: Record<string, Task> = {};

    if (fs.existsSync(jsonPath)) {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      if (raw.trim().length > 0) {
        jsonData = JSON.parse(raw);
      }
    }

    // 更新指定任务
    jsonData[taskId] = tasks.get(taskId)!;

    // 写回文件
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');

    const task = jsonData[taskId];
    if (task.status === "completed") {
      if (task.type === "text_to_image") {
        fs.writeFileSync(JSON_IMAGE_PATH, JSON.stringify(task, null, 2));
      } else if (task.type === "image_to_video") {
        fs.writeFileSync(JSON_VIDEO_PATH, JSON.stringify(task, null, 2));
      }
    }

    console.log(`Tasks pool: Task ${taskId} 已保存到 ${jsonPath}`);
  }

  // 移除任务
  removeTaskFromPool(taskId: string, reason: string = 'completed') {
    const task = this.tasks.get(taskId);
    if (task) {
      console.log(`Tasks pool: removing task ${taskId} from pool (reason: ${reason})`);
      if (reason === 'completed') {
        console.log(`Tasks pool: write task ${taskId} to JSON for it completed`);
        TasksPool.saveTaskById(this.tasks, taskId, JSON_PATH);
      }
      this.tasks.delete(taskId);
    }
  }

  // 检查任务是否存在
  isTaskInPool(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  isTaskInPoolFilter(taskId: string, status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'){
    return this.tasks.has(taskId) && this.tasks.get(taskId)?.status == status;
  }

  // 往池子里加任务
  addTask(task: Task) {
    this.tasks.set(task.id, task);
  }

  // 获取任务
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  // 返回所有任务
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  //定时清理任务
  cleanTasks(task_duration : number): void{
    const now = new Date().getTime();
    const tasksToDelete: string[] = [];
    
    this.tasks.forEach((task, taskId) => {
      const taskTime = new Date(task.updated_at).getTime();
      const isOld = now - taskTime > task_duration;
      const isFinished = task.status === 'completed' || task.status === 'failed';
      
      if (isOld && isFinished) {
        tasksToDelete.push(taskId);
      }
    });
    
    console.log(`Tasks Pool: Start to clean old tasks, found ${tasksToDelete.length} tasks to delete.`);
    tasksToDelete.forEach(taskId => {
      console.log(`Tasks Pool: Cleaning up old task: ${taskId}`);
      this.tasks.delete(taskId);
    });
    
    if (tasksToDelete.length > 0) {
      console.log(`Tasks Pool: Cleaned up ${tasksToDelete.length} old tasks`);
    }
  }

  delete(taskId: string){
    if(this.isTaskInPool(taskId)){
        this.tasks.delete(taskId);
    }
  }
}


