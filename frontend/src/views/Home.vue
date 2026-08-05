<template>
  <div class="page-layout">
    <!-- 侧边栏 -->
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>
    
    <!-- 主要内容区域 -->
    <main class="layout-main">
        <div class="welcome-content">
          <h1>多模态数据分类平台</h1>
          <p class="lead">欢迎使用多模态数据分类平台，请从左侧菜单选择功能模块</p>
          <div class="feature-overview">
            <div class="feature-item">
              <h4>📝 图文谣言检测</h4>
              <p>检测图文内容是否为谣言</p>
            </div>
            <div class="feature-item">
              <h4>🎥 视频分析</h4>
              <p>提供专业的视频分析服务</p>
              <ul class="sub-features">
                <li>子模块一 - 视听平台不良内容检测系统</li>
                <li>子模块二 - 视频智能摘要系统</li>
                <li>子模块三 - 不良视频分类数据集</li>
              </ul>
            </div>
            <div class="feature-item">
              <h4>🤖 AI生成图片检测</h4>
              <p>识别AI生成的图片并给出可疑位置</p>
            </div>
          </div>
        </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import Sidebar from '../components/Sidebar.vue'
</script>

<style scoped>
/* 统一布局系统 */
.page-layout {
  display: flex;
  width: 100%;
  min-height: calc(100vh - 70px);
}

.layout-sidebar {
  flex: 0 0 240px;
  background: rgb(227, 236, 250);
}

.layout-main {
  flex: 1;
  padding: 20px;
  background: #f5f7fa;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .layout-sidebar {
    flex: 0 0 200px;
  }
}

@media (max-width: 768px) {
  .page-layout {
    flex-direction: column;
  }
  
  .layout-sidebar {
    flex: 0 0 auto;
    width: 100%;
  }
  
  .layout-main {
    padding: 15px;
  }
}

@media (max-width: 576px) {
  .layout-main {
    padding: 10px;
  }
}

/* 主页样式完全复制自Django版本 */
.container-fluid {
  padding: 0;
}

/* 页面主体 */
.main-container {
  display: flex;
  height: calc(100vh - 70px);
  overflow: hidden;
}

/* 主要内容区域 */
.content-legacy {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  /* 移除 overflow-y: auto */
}

.welcome-content {
  max-width: 800px;
  margin: 0 auto;
}

.welcome-content h1 {
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 20px;
  text-align: center;
}

.welcome-content .lead {
  font-size: 1.2rem;
  color: #666;
  text-align: center;
  margin-bottom: 40px;
}

.feature-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 30px;
  margin-top: 40px;
}

.feature-item {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.feature-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.15);
}

.feature-item h4 {
  font-size: 1.3rem;
  margin-bottom: 15px;
  color: #333;
}

.feature-item p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 15px;
}

.sub-features {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sub-features li {
  padding: 5px 0;
  color: #888;
  font-size: 0.9rem;
}

.sub-features li::before {
  content: "→";
  margin-right: 8px;
  color: #3b87d8;
  font-weight: bold;
}

/* 适应移动端 */
@media (max-width: 768px) {
  .feature-overview {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  
  .feature-item {
    padding: 20px;
  }
  
  .welcome-content h1 {
    font-size: 2rem;
  }
}
</style> 
