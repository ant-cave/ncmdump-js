<script setup>
// ncmdump-js 前端演示:拖拽/选择 ncm 文件,解密后下载 mp3/flac
// 简约黑白灰配色,全程浏览器内处理,文件不会上传
import { ref } from 'vue'
import { dump } from '../index.js'

const isDragging = ref(false)
const files = ref([])
const processing = ref(false)
const error = ref('')

// 是否写入歌曲信息与封面
const fixMetadata = ref(true)

const inputRef = ref(null)

function onFileChange(event) {
  handleFiles([...event.target.files])
  event.target.value = ''
}

function onDrop(event) {
  isDragging.value = false
  handleFiles([...event.dataTransfer.files])
}

function handleFiles(list) {
  const ncmFiles = list.filter((f) => f.name.toLowerCase().endsWith('.ncm'))
  if (ncmFiles.length === 0) {
    error.value = '请选择 .ncm 文件'
    return
  }
  error.value = ''
  for (const file of ncmFiles) {
    files.value.push({
      file,
      status: '等待处理',
      result: null,
      err: '',
    })
  }
  processAll()
}

async function processAll() {
  processing.value = true
  for (const item of files.value) {
    if (item.status !== '等待处理') continue
    try {
      item.status = '解密中'
      const result = await dump(item.file, { fixMetadata: fixMetadata.value })
      item.result = result
      item.status = '完成'
    } catch (e) {
      item.err = e.message
      item.status = '失败'
    }
  }
  processing.value = false
}

function download(item) {
  item.result.download()
}

function clearAll() {
  files.value = []
  error.value = ''
}
</script>

<template>
  <div class="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col items-center px-4 py-10">
    <header class="text-center mb-8">
      <h1 class="text-2xl font-semibold tracking-wide">ncmdump-js</h1>
      <p class="text-sm text-neutral-500 mt-2">纯前端解密网易云 ncm 文件,数据不出浏览器</p>
    </header>

    <!-- 拖拽/选择区域 -->
    <div
      class="w-full max-w-xl"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      <div
        class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors"
        :class="isDragging ? 'border-black bg-neutral-200' : 'border-neutral-400 hover:border-neutral-600'"
        @click="inputRef?.click()"
      >
        <p class="text-neutral-600">把 ncm 文件拖到这里,或点击选择</p>
        <p class="text-xs text-neutral-400 mt-2">支持多选,处理完成后可下载 mp3/flac</p>
        <input ref="inputRef" type="file" accept=".ncm" multiple class="hidden" @change="onFileChange" />
      </div>

      <!-- 选项 -->
      <label class="mt-4 flex items-center justify-center gap-2 text-sm text-neutral-600 cursor-pointer">
        <input v-model="fixMetadata" type="checkbox" class="accent-black" />
        写入歌曲信息与封面
      </label>
    </div>

    <p v-if="error" class="mt-4 text-sm text-red-600">{{ error }}</p>

    <!-- 文件列表 -->
    <div v-if="files.length" class="w-full max-w-xl mt-6 space-y-3">
      <div class="flex justify-between items-center">
        <span class="text-sm text-neutral-500">{{ files.length }} 个文件</span>
        <button class="text-xs text-neutral-500 underline hover:text-neutral-800" @click="clearAll">清空</button>
      </div>

      <div
        v-for="(item, index) in files"
        :key="index"
        class="bg-white border border-neutral-200 rounded-lg p-4 flex items-center justify-between gap-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">{{ item.file.name }}</p>
          <p v-if="item.result" class="text-xs text-neutral-500 mt-1">
            {{ item.result.metadata?.musicName || '未知歌名' }} ·
            {{ item.result.metadata?.artistName || '未知歌手' }}
          </p>
          <p v-if="item.err" class="text-xs text-red-600 mt-1">{{ item.err }}</p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <span
            class="text-xs px-2 py-1 rounded"
            :class="{
              'bg-neutral-200 text-neutral-500': item.status === '等待处理',
              'bg-neutral-800 text-white': item.status === '解密中',
              'bg-neutral-100 text-neutral-700': item.status === '完成',
              'bg-red-50 text-red-600': item.status === '失败',
            }"
          >
            {{ item.status }}
          </span>
          <button
            v-if="item.result"
            class="text-xs px-3 py-1.5 bg-black text-white rounded hover:bg-neutral-700"
            @click="download(item)"
          >
            下载 {{ item.result.extension }}
          </button>
        </div>
      </div>
    </div>

    <footer class="mt-10 text-xs text-neutral-400">
      演示页面不参与 npm 发布,仅用于浏览器内验证
    </footer>
  </div>
</template>
