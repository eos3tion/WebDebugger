## 项目建立的原因
很多情况下，无法使用调试器，比如微信的浏览器，或者其他ios下一些第三方浏览器  
这些浏览器并不开启webview的调试，无法使用 `Mac Safari`或者 `Chrome://insepect` 进行调试  
所以需要一种手段对页面进行调试  

## 目前想到的方案  
1. 建立一个客户端脚本，需要调试页面的时候，加上如下脚本：
```html
<script async="async" data-wdserver="192.168.0.168:8888" src="webdebugger.js"></script>
```
可配置的参数：    
`data-wddelay`:调试器重连的延迟时间  
`data-wdserver`:要连接的远程服务器地址  

2. 脚本启动时，检查是否可以使用`websocket`连接`data-wdserver`的服务器  
3. 连接成功后，提交 `referer` `user-agent`等信息
4. 服务端可以发送指令到客户端
5. 客户端接收到信息后，使用如下代码执行
```javascript
function debugger(serverMsg){
    try{
        var result=eval(serverMsg);
    }catch(e){
        var error = e;
    }
    return {result,error}
}
```
将结果数据序列化后，回发给服务端，服务端在控制台进行打印  
