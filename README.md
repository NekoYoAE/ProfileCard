# ProfileCard
为ccw社区主页的个人介绍提供美观的个人信息卡片

## 使用说明
将项目代码复制到ccw个人主页的简介处：
```md
![提示文字](https://profilecard.seia0070.dpdns.org/?oid=你的账号oid)
```

---

### 参数填写

| 参数     | 示例                | 默认值 |    
|----------|---------------------|--------|
| oid      | 你的账号oid（必填！）| 无     |
| theme    | dark、light         | dark   |
| card     | 1、2                | 1      | 
| animation| 1、0                | 1      |

---

卡片样式1：

![卡片样式1](https://profilecard.seia0070.dpdns.org/?oid=5d47fec31c94e579b89cd259&card=1)

卡片样式2：

![卡片样式1](https://profilecard.seia0070.dpdns.org/?oid=5d47fec31c94e579b89cd259&card=2)

---
服务基于 Cloudflare Worker ，加载速度慢是正常情况
---
[项目灵感来源](https://github.com/YearnstudioYangyi/scratch-readme-stats/)