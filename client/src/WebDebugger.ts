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
         * DebugServer的key
         */
        DebuggerServerKey = "data-wdserver"
    }
    WebSocket.prototype.sendCmd = function (this: WebSocket, type: CmdType, data, id?: number) {
        this.send(JSON.stringify({ type, data, id }))
    }

    let ws: WebSocket;

    let serverUrl: string;

    let serverHandlers: { [index: number]: { (cmd: Cmd, ws: WebSocket): void } } =
        { [CmdType.Execute]: execute };

    function execute(cmd: ExecuteCmd, ws: WebSocket) {
        let result = eval(cmd.data);
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
                    let { value, set, get, enumerable, writable, configurable } = Object.getOwnPropertyDescriptor(result, key);
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
                    entity.type = getObjectType(currentValue);
                    if (currentValue == null && toCValue !== "object") {//如果是Object，不显示值
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
                            type = fun.toString();// function XXXX(){..............}
                            type = type.substring(9/* `function `.length */, type.indexOf("("));
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
        let script = document.querySelector(`script[${Constant.DebuggerServerKey}]`);
        serverUrl = script && script.getAttribute(Constant.DebuggerServerKey);
        if (!serverUrl) {
            return
        }
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
            serverUrl = (cProtocal == "https:" ? "wss" : "ws") + "//" + serverUrl;
        }
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
            return console.error(e);
        }
        ws.onopen = onOpen;
        ws.onmessage = onMessage;
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

}