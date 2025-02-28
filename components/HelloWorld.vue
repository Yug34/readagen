<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue';
import { browser } from 'wxt/browser';

defineProps({
  msg: String,
});

const count = ref(0);
const pageContent = ref('');
const isLoading = ref(false);
const error = ref('');

onMounted(() => {
  const savedCount = localStorage.getItem('wxt-count');
  if (savedCount !== null) {
    count.value = parseInt(savedCount, 10);
  }
});

watch(count, (newValue) => {
  localStorage.setItem('wxt-count', newValue.toString());
});

const getPageContent = async () => {
  isLoading.value = true;
  error.value = '';
  pageContent.value = '';
  
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (!activeTab || !activeTab.id) {
      throw new Error('No active tab found');
    }

    const result = await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const getReadableContent = () => {
          const paragraphs = document.querySelectorAll('p, article, .article, .content, .post');
          let content = '';
          
          paragraphs.forEach(p => {
            if (p.textContent && p.textContent.trim().length > 20) {
              content += `<p>${p.textContent}</p>`;
            }
          });
          
          if (!content) {
            const main = document.querySelector('main') || document.body;
            content = main.innerHTML;
          }
          
          return {
            title: document.title,
            content: content,
            url: window.location.href
          };
        };
        
        return getReadableContent();
      }
    });
    
    if (result && result[0] && result[0].result) {
      const article = result[0].result;
      pageContent.value = article.content;
      
      localStorage.setItem('wxt-page-content', article.content);
      localStorage.setItem('wxt-page-title', article.title);
      localStorage.setItem('wxt-page-url', article.url);
    } else {
      throw new Error('Failed to extract content');
    }
  } catch (err) {
    console.error('Error extracting page content:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <h1>{{ msg }}</h1>

  <div class="card">
    <button type="button" @click="count++">count is {{ count }}</button>
    <button type="button" @click="getPageContent" :disabled="isLoading">
      {{ isLoading ? 'Loading...' : 'Extract Content' }}
    </button>
  </div>
  
  <div v-if="error" class="error">
    {{ error }}
  </div>
  
  <div class="content-preview" v-if="pageContent">
    <h2>Extracted Content</h2>
    <div v-html="pageContent"></div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.content-preview {
  margin-top: 1rem;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 1rem;
  text-align: left;
}

.error {
  color: red;
  margin: 1rem 0;
}
</style>