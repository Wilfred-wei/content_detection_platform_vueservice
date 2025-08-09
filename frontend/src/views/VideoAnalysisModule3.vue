<template>
  <div class="page-layout">
    <!-- Sidebar -->
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>
    
    <!-- Main Content Area -->
    <main class="layout-main">
        <div class="content-area">
          <h2>视频语义理解</h2>
        </div>
    </main>
  </div>
</template>

<script>
import { Modal } from 'bootstrap';
import Sidebar from '../components/Sidebar.vue';
import { module2API } from '../api';

export default {
  name: 'VideoAnalysisModule3',
  components: {
    Sidebar
  }
}
</script>

<style>
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

/* Global Styles */
body {
  font-family: 'Arial', sans-serif;
  background: #f5f7fa;
  margin: 0;
  padding: 0;
  color: #333;
}

html, body {
  width: 100%;
  height: 100%;
}

/* Main Content */
.content-legacy {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  /* 移除 overflow-y: auto */
}

.content-area {
  padding: 40px;
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 10px;
  margin: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  /* 移除 overflow-y: auto，使用页面级滚动 */
}

.content-area h2 {
  color: #0056b3;
  margin-bottom: 20px;
  font-size: 2em;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

.content-area p {
  color: #666;
  font-size: 1.1em;
  line-height: 1.6;
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  width: 100%;
}

.task-header .d-flex {
  width: 100%;
  justify-content: space-between;
}

/* Feature Items */
.feature-overview {
  display: grid;
  gap: 30px;
  margin-top: 30px;
}

.feature-item {
  background: white;
  padding: 25px;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  transition: transform 0.3s ease;
}

.feature-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.feature-item h4 {
  color: #0056b3;
  margin-bottom: 15px;
  font-size: 1.3em;
}

.feature-item p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 15px;
}

/* Buttons */
.btn-primary {
  background: #3b87d8;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 5px;
  cursor: pointer;
}

.btn-primary:hover {
  background: #4875b0;
}

/* Task Table */
.task-table-wrapper {
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid #ddd;
  max-height: calc(100vh - 300px);
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  position: sticky;
  top: 0;
  background: #f1f1f1;
  z-index: 10;
}

th, td {
  padding: 16px;
  text-align: center;
  vertical-align: middle;
  font-size: 18px;
}

.task-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.task-actions button {
  font-size: 16px;
  padding: 10px 16px;
  border: none;
  cursor: pointer;
  border-radius: 8px;
  margin: 5px;
  transition: 0.3s;
}

.btn-view {
  background: #5e9dc8;
  color: white;
}

.btn-view:hover {
  background: #4c87b0;
}

.btn-delete {
  background: #d27b85;
  color: white;
}

.btn-delete:hover {
  background: #b86470;
}

/* Spinner Animation */
.spinner-border {
  display: inline-block;
  width: 2rem;
  height: 2rem;
  vertical-align: text-bottom;
  border: 0.25em solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spinner-border .75s linear infinite;
}

@keyframes spinner-border {
  to { transform: rotate(360deg); }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
