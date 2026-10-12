# 技术交接

## 定稿行为

图片B结果并列、配音02描述优先；删除版本对比入口。主体和声音库宽屏最多5列，窄屏自适应。单图/叠卡统一留白，悬停上浮2px，后层轻微错开±1.5°；减少动态效果偏好关闭运动。

图片版本点击即应用，失败回退；“用作参考”累加并去重多图，逐张可移除。左侧形象缩略图名称仅悬浮显示。参考图添加控件是方形虚线。模型、版本栏和底部横排操作对齐。配音唯一入口进入统一弹窗；设计保留描述/名称/展开试听台词及应用范围；声音库试听按钮底部对齐。

## 文件入口

前端组件在source/apps/web/app/components/project/。列表subject-list.tsx，图片subject-image-dialog.tsx，参考subject-reference-picker.tsx，版本subject-study-history.tsx，叠卡subject-preview-stack.tsx，声音subject-voice-dialog.tsx及voice-design-panel.tsx/voice-clone-panel.tsx/voice-library-cards.tsx。

B/focus样式及context在source/apps/web/local-preview/workbench-studies.tsx、workbench-studies.css、voice-studies.css。正式迁移需把这些样式/context接入真实项目页面，不安装local-preview/api.ts模拟器。

## 多参考图链路

前端URL/Blob数组referenceImages → multipart允许声明的数组字段重复 → server逐张上传 → 队列referenceImageUrls → worker调用SDK imageUrls。

单张仍兼容parentImage/referenceImageUrl/imageUrl。Z Image/Wan不接受参考图的校验保留。外部生成服务是否接受imageUrls数组尚未联调确认，必须验证真实模型限制、数量/格式、请求读回及失败重试后才能认定生产支持。

## 集成步骤

在原monorepo独立开发分支逐文件比较source/，接入UI和CSS/context；联调鉴权、项目数据、上传/创建/导入、生图、配音及队列/provider。私有工作区中运行已有Web表单/server、worker处理器、SDK相关测试，再检查真实流程。不以独立演示通过替代生产联调。

公开目录包含本次相关代码、用户授权的本地真实展示快照、界面截图与图片CDN引用清单；不包含数据库/凭据/内部SDK文档。原工作区必要依赖通过@repo/*及~/别名引用；此公开仓库不声称提供整个monorepo构建链路。
