import { createRouter, createWebHistory } from 'vue-router'
const Home = () => import('../views/Home.vue')
const RumorDetection = () => import('../views/RumorDetection.vue')
const VideoAnalysisModule1 = () => import('../views/VideoAnalysisModule1.vue')
const VideoAnalysisModule2 = () => import('../views/VideoAnalysisModule2.vue')
const VideoAnalysisModule3 = () => import('../views/VideoAnalysisModule3.vue')
const DetectionAgent = () => import('../views/DetectionAgent.vue')

const router = createRouter({
  history: createWebHistory('/M3/'),
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
      component: DetectionAgent
    },
    {
      path: '/detection-agent/image/',
      alias: '/detection-agent/',
      name: 'detection_agent',
      component: DetectionAgent
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
    },
    {
      path: '/video_analysis/module3/',
      name: 'video_analysis_module3',
      component: VideoAnalysisModule3
    }
  ]
})

export default router
