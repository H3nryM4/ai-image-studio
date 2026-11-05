import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installMobileViewportGuards } from './lib/viewport'

installMobileViewportGuards()

// 经典滚动条占着右侧一整列，会伸进顶栏，此时改用细滚动条并让页面在 [data-page-scroll] 里滚动（见 index.css）；
// 手机等悬浮滚动条不占宽度，仍滚动窗口，保留地址栏收起和下拉刷新。须在细滚动条样式生效前测量浏览器原生的滚动条。
// Firefox 不支持 ::-webkit-scrollbar，滚动条无法从顶栏下方开始，改为容器滚动后反而被顶栏遮住，所以仍滚动窗口
if (CSS.supports('selector(::-webkit-scrollbar)')) {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll'
  document.body.appendChild(probe)
  if (probe.offsetWidth > probe.clientWidth) document.documentElement.dataset.classicScrollbar = ''
  probe.remove()
}

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
        console.error('Service worker registration failed:', error)
      })
    })
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister())
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
