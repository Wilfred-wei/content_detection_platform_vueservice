import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import RumorDetection from '../views/RumorDetection.vue'
import AIImageDetection from '../views/AIImageDetection.vue'
import VideoAnalysisModule1 from '../views/VideoAnalysisModule1.vue'
import VideoAnalysisModule2 from '../views/VideoAnalysisModule2.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/rumor_detection/',
      name: 'rumor_detection',
      component: RumorDetection
    },
    {
      path: '/ai_image_detection/',
      name: 'ai_image_detection',
      component: AIImageDetection
    },
    {
      path: '/video_analysis/module1/',
      name: 'video_analysis_module1',
      component: VideoAnalysisModule1
    },
    {
      path: '/video_analysis/module2/',
      name: 'video_analysis_module2',
      component: VideoAnalysisModule2
    }
  ]
})

export default router 