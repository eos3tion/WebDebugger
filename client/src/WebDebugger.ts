/// <reference path="../../common/Define.ts" />
interface WebSocket {
    /**
     * 发送指令
     * 
     * @param {CmdType} type 
     * @param {any} data 
     * @param {number} [id] 
     * @memberof WebSocket
     */
    sendCmd(type: CmdType, data, id?: number);
}
module WebDebugger {

    const enum Constant {

        /**
         * 默认的重连延迟时间
         */
        DefaultReconnectDelay = 5 * 60 * 1000,
    }

    const enum StringConstant {
        /**
         * DebugServer的key
         */
        DebuggerServerKey = "data-wdserver",

        /**
         * DebugServer的重连时间
         */
        ReconnectDelay = "data-wddelay",

    }
    WebSocket.prototype.sendCmd = function (this: WebSocket, type: CmdType, data, id?: number) {
        this.send(JSON.stringify({ type, data, id }))
    }

    let ws: WebSocket;

    /**
     * 服务器路径
     */
    let serverUrl: string;

    /**
     * 重连的延迟
     */
    let reconnectDelay: number = Constant.DefaultReconnectDelay;

    /**
     * 重连的计时器标识
     */
    let tReconnect: number;

    let serverHandlers: { [index: number]: { (cmd: Cmd, ws: WebSocket): void } } =
        { [CmdType.Execute]: execute };

    const getData = function () {
        let test: number;
        try {
            test = eval("1+1")
        } catch{ }
        //检测当前环境是否支持 eval 某些环境把 eval屏蔽了
        return test == 2 ? eval : function getData(expression: string) {
            expression = expression.trim();
            let subs = expression.split(".");
            let result: any = window;
            let len = subs.length;
            for (let i = 0; i < len; i++) {
                let sub = subs[i];
                let res = /([a-zA-Z_$][0-9a-zA-Z_$]+)\(([^)]*)\)/.exec(sub);
                let c = sub;
                if (res) {//字符串为方法
                    let handler = result[res[1]] as Function;
                    let params = res[2];
                    let datas: any[];
                    if (params) {
                        datas = params.split(",");
                        for (var j = 0; j < params.length; j++) {
                            datas[j] = getData(params[j]);
                        }
                    } else {
                        datas = undefined;
                    }
                    result = handler.apply(result, datas);
                } else {
                    result = result[c];
                }
            }
            return result;
        }
    }()

    function execute(cmd: ExecuteCmd, ws: WebSocket) {
        let result = getData(cmd.data);
        //尝试解析结果
        let define = {} as ObjectDefine;
        //得到第一层的数据
        let tof = typeof result;
        let type = getObjectType(result, tof);
        if (tof === "object") {
            if (result !== null) {
                let entities = [] as ObjectKeyValueEntity[];
                define.data = entities;
                //获取其自身的属性和方法
                Object.getOwnPropertyNames(result).forEach(key => {
                    let { set, get, enumerable, writable, configurable } = Object.getOwnPropertyDescriptor(result, key);
                    let entity = { key } as ObjectKeyValueEntity;
                    let modifers = (+enumerable << DescriptorModifier.EnumerableShift)
                        | (+writable << DescriptorModifier.WritableShift)
                        | (+configurable << DescriptorModifier.ConfigurableShift);
                    let currentValue = result[key];
                    if (get) {
                        entity.getter = get.toString();
                    }
                    if (set) {
                        entity.setter = set.toString();
                    }
                    let toCValue = typeof currentValue;
                    entity.modifiers = modifers;
                    entity.type = getObjectType(currentValue);
                    if (currentValue == null || toCValue !== "object") {//如果是Object，不显示值
                        if (toCValue === "function") {
                            currentValue = currentValue.toString();
                        }
                        entity.value = currentValue;
                    }
                    entities.push(entity);
                });
            }
        } else if (type === "function") {
            define.data = result.toString();
        } else {
            define.data = result;
        }

        define.type = type;
        ws.sendCmd(CmdType.ExecuteResult, define, cmd.id);
    }

    function getObjectType(result, type?: string) {
        type = type || typeof result;
        if (type === "object") {
            if (result === null) {
                type = ObjectType.Null;
            } else {
                //尝试获取对象的构造函数
                let fun = result.constructor;
                if (fun) {
                    if (typeof fun === "function") {
                        let name = fun.name;
                        if (name) {
                            type = name;
                        } else {
                            type = fun.toString();
                            if (type[0] == "c") {//class XXXX{........}
                                type = type.substring(6/* `class `.length */, type.indexOf("{"));
                            } else {// function XXXX(){..............}
                                type = type.substring(9/* `function `.length */, type.indexOf("("));
                            }
                        }
                    } else {
                        type = fun.toString();
                    }
                } else {
                    type = Object.prototype.toString.call(result);// [object XXXXXX]
                    type = type.substring(8/*`[object `*/, type.indexOf("]"));
                }
            }
        }
        return type
    }


    export function init() {
        let attr = StringConstant.DebuggerServerKey;
        let script = document.querySelector(`script[${attr}]`);
        serverUrl = script && script.getAttribute(attr);
        if (!serverUrl) {
            return
        }
        reconnectDelay = +script.getAttribute(StringConstant.ReconnectDelay) || Constant.DefaultReconnectDelay;
        //检查地址
        let res = /^(ws(s)?:)\/\//.exec(serverUrl);
        let cProtocal = location.protocol;
        if (res) {//有配置协议地址
            let protocal = res[1];
            //检查协议是否和当前 location的协议对应上
            if (cProtocal == "https:" && protocal != "wss:") {//是https协议，但是配置的不是 wss协议
                return
            }
        } else {
            serverUrl = (cProtocal == "https:" ? "wss" : "ws") + "://" + serverUrl;
        }
    }

    function checkReconnect() {
        if (!ws) {
            connect();
        }
    }

    function tryReconnect() {
        clearTimeout(tReconnect);
        tReconnect = setTimeout(checkReconnect, reconnectDelay);
    }

    /**
     * 
     * 连接服务器
     * @export
     * @returns 
     */
    export function connect() {
        try {
            ws = new WebSocket(serverUrl);
        } catch (e) {
            tryReconnect();
            return console.error(e);
        }
        ws.onopen = onOpen;
        ws.onmessage = onMessage;
        ws.onclose = onClose;
    }

    function onClose(this: WebSocket, e: CloseEvent) {
        this.onopen = undefined;
        this.onmessage = undefined;
        this.onclose = undefined;
        if (this == ws) {
            ws = undefined;
        }
        //隔interval时间尝试重新连接一次
        tryReconnect();
    }

    function onMessage(this: WebSocket, e: MessageEvent) {
        let data = e.data as string;
        if (data) {
            let cmd: ExecuteCmd;
            try {
                cmd = JSON.parse(data);
            } catch (e) {
                return console.error(e);
            }
            if (cmd) {
                let handler = serverHandlers[cmd.type];
                if (handler) {
                    try {
                        handler(cmd, this);
                    } catch (e) {
                        //执行发生错误
                        let errCmd: ErrorCmdData = { message: e.message, stack: e.stack };
                        return this.sendCmd(CmdType.ExecuteError, errCmd, cmd.id);
                    }
                }
            }
        }
    }

    function onOpen(this: WebSocket, e: Event) {
        //与服务端连接成功
        this.sendCmd(CmdType.Connect, { referer: location.href, ua: navigator.userAgent });
    }

    init();
    connect();
}