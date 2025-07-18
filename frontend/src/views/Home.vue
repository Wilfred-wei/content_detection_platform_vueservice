<template>
  <div class="container-fluid">
    <div class="row d-flex flex-nowrap">
      <!-- 侧边栏 -->
      <Sidebar />
      
      <!-- 主要内容区域 -->
      <main class="content col-10">
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
                <li>子模块一 - XXXXXX</li>
                <li>子模块二 - XXXXXX</li>
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
  </div>
</template>

<script setup lang="ts">
import Sidebar from '../components/Sidebar.vue'
</script>

<style scoped>
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
.content {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  overflow-y: auto;
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