<script setup>
// ncmdump-js 前端演示:拖拽/选择 ncm 文件,解密后下载 mp3/flac
// 简约黑白灰配色,全程浏览器内处理,文件不会上传
// 包含详细处理日志,标注封面来源(内置 / 网络拉取 / 无)
import { ref } from 'vue'
import { dump, parseNcm } from '../index.js'

const isDragging = ref(false)
const files = ref([])
const processing = ref(false)
const error = ref('')

// 是否写入歌曲信息与封面
const fixMetadata = ref(true)
// ncm 未内置封面时,是否从网易云 CDN 拉取
const fetchMissingCover = ref(true)

const inputRef = ref(null)

function onFileChange(event) {
  handleFiles([...event.target.files])
  event.target.value = ''
}

function onDrop(event) {
  isDragging.value = false
  handleFiles([...event.dataTransfer.files])
}

// 追加一条日志
function pushLog(item, kind, msg) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  item.logs.push({ time, kind, msg })
}

// 把图片字节转成可预览的 objectURL
function toPreviewUrl(bytes) {
  if (!bytes || bytes.length === 0) return ''
  return URL.createObjectURL(new Blob([bytes], { type: 'image/*' }))
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
      logs: [],
      coverSource: '', // 封面来源:'内置' | '网络拉取' | '无'
      coverUrl: '', // 封面预览地址
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
      pushLog(item, 'info', `开始处理:${item.file.name}`)

      // 1. 先解析,确认 ncm 是否内置封面
      const parsed = parseNcm(await item.file.arrayBuffer())
      pushLog(item, 'info', `格式识别:${parsed.format.toUpperCase()}`)
      pushLog(item, 'info', `歌曲信息:${parsed.metadata?.musicName || '未知'} / ${parsed.metadata?.artistName || '未知'} / ${parsed.metadata?.album || '未知专辑'}`)

      if (parsed.image && parsed.image.length > 0) {
        pushLog(item, 'success', `内置封面:${(parsed.image.length / 1024).toFixed(1)} KB`)
      } else if (fetchMissingCover.value) {
        pushLog(item, 'warn', '未发现内置封面,尝试从网易云 CDN 拉取...')
      } else {
        pushLog(item, 'warn', '未发现内置封面,且已关闭网络拉取')
      }

      // 2. 解密并(可选)拉取缺失封面
      const result = await dump(item.file, {
        fixMetadata: fixMetadata.value,
        fetchMissingCover: fetchMissingCover.value,
      })

      if (result.image && result.image.length > 0) {
        if (parsed.image && parsed.image.length > 0) {
          item.coverSource = '内置'
          pushLog(item, 'success', `封面来源:文件内置(实际写入 ${(result.image.length / 1024).toFixed(1)} KB)`)
        } else {
          item.coverSource = '网络拉取'
          pushLog(item, 'success', `封面来源:CDN 拉取(实际写入 ${(result.image.length / 1024).toFixed(1)} KB)`)
        }
        item.coverUrl = toPreviewUrl(result.image)
      } else {
        item.coverSource = '无'
        pushLog(item, 'warn', '封面来源:无(文件未内置且拉取不可用)')
      }

      item.result = result
      item.status = '完成'
      pushLog(item, 'success', `解密完成,输出 ${result.filename}`)
    } catch (e) {
      item.err = e.message
      item.status = '失败'
      pushLog(item, 'error', `失败:${e.message}`)
    }
  }
  processing.value = false
}

function download(item) {
  item.result.download()
}

function clearAll() {
  // 释放已创建的预览 URL
  for (const item of files.value) {
    if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
  }
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
      <div class="mt-4 flex items-center justify-center gap-6 text-sm text-neutral-600">
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="fixMetadata" type="checkbox" class="accent-black" />
          写入歌曲信息与封面
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="fetchMissingCover" type="checkbox" class="accent-black" />
          缺失封面时联网拉取
        </label>
      </div>
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
        class="bg-white border border-neutral-200 rounded-lg p-4"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{{ item.file.name }}</p>
            <p v-if="item.result" class="text-xs text-neutral-500 mt-1">
              {{ item.result.metadata?.musicName || '未知歌名' }} ·
              {{ item.result.metadata?.artistName || '未知歌手' }}
            </p>
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

        <!-- 封面预览与来源 -->
        <div v-if="item.result" class="mt-3 flex items-center gap-3">
          <img
            v-if="item.coverUrl"
            :src="item.coverUrl"
            alt="封面"
            class="w-14 h-14 object-cover rounded border border-neutral-200"
          />
          <div v-else class="w-14 h-14 rounded border border-neutral-200 bg-neutral-100 flex items-center justify-center text-neutral-400 text-[10px]">
            无封面
          </div>
          <span
            class="text-xs px-2 py-0.5 rounded"
            :class="{
              'bg-black text-white': item.coverSource === '内置',
              'bg-neutral-800 text-white': item.coverSource === '网络拉取',
              'bg-neutral-200 text-neutral-500': item.coverSource === '无',
            }"
          >
            {{ item.coverSource === '网络拉取' ? '封面:CDN 拉取' : item.coverSource === '内置' ? '封面:内置' : '封面:无' }}
          </span>
        </div>

        <!-- 详细日志 -->
        <div v-if="item.logs.length" class="mt-3 bg-neutral-50 border border-neutral-200 rounded p-3 space-y-1 max-h-48 overflow-y-auto">
          <p
            v-for="(log, i) in item.logs"
            :key="i"
            class="text-xs leading-relaxed"
            :class="{
              'text-neutral-500': log.kind === 'info',
              'text-green-700': log.kind === 'success',
              'text-amber-600': log.kind === 'warn',
              'text-red-600': log.kind === 'error',
            }"
          >
            <span class="text-neutral-400">{{ log.time }}</span> {{ log.msg }}
          </p>
        </div>

        <p v-if="item.err" class="text-xs text-red-600 mt-2">{{ item.err }}</p>
      </div>
    </div>

    <footer class="mt-10 text-xs text-neutral-400">
      演示页面不参与 npm 发布,仅用于浏览器内验证
    </footer>
  </div>
</template>
