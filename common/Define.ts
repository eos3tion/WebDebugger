const enum CmdType {
    /**
     * 服务端指令的掩码
     */
    ServerMask = 0b10000000,
    /**
     * 客户端尝试连接服务器
     */
    Connect = 1,

    /**
     * 服务端执行一段代码
     */
    Execute = ServerMask | 2,

    /**
     * 执行的结果
     */
    ExecuteResult = 3,

    /**
     * 执行出现错误
     */
    ExecuteError = 4
}

/**
 * 通讯的指令
 * 
 * @interface Cmd
 */
interface Cmd {
    /**
     * 指令序列
     * 
     * @type {number}
     * @memberof Cmd
     */
    id: number;
    /**
     * 指令类型
     * 
     * @type {CmdType}
     * @memberof Cmd
     */
    type: CmdType;

    data?: any;
}

interface ConnectCmdData {
    /**
     * 
     * 连接服务器的引用页面
     * @type {string}
     * @memberof ConnectCmdData
     */
    referer: string;

    /**
     * userAgent信息
     * 
     * @type {string}
     * @memberof ConnectCmdData
     */
    ua: string;
}

interface ExecuteCmd extends Cmd {
    data: string;
}

interface ResultCmd extends Cmd {

    data: ObjectDefine;
}

interface ErrorCmdData {
    /**
     * 错误的消息内容
     * 
     * @type {string}
     * @memberof ErrorCmdData
     */
    message: string;

    /**
     * 堆栈信息
     * 
     * @type {string}
     * @memberof ErrorCmdData
     */
    stack: string;
}

interface ErrorCmd extends Cmd {
    data: ErrorCmdData;
}

interface ObjectDefine {
    /**
     * 对象类型
     * 
     * @type {string}
     * @memberof ObjectDefine
     */
    type: string;

    /**
     * 属性列表
     * 
     * @type {string[]}
     * @memberof ObjectDefine
     */
    data?: ObjectKeyValueEntity[] | boolean | string | number;
}

interface ObjectKeyValueEntity {
    /**
     * 
     * 数据的属性名称
     * @type {string}
     * @memberof ObjectKeyValue
     */
    key: string;

    /**
     * 数据类型
     * 
     * @type {string}
     * @memberof ObjectKeyValueEntity
     */
    type: string;
    /**
     * 数据当前值
     * 如果type 为 object  
     * 则没有此数据，即 undefined
     * @type {*}
     * @memberof ObjectKeyValueEntity
     */
    value?: any;

    /**
     * 如果有setter，则此值为setter方法的 toString
     * 
     * @type {*}
     * @memberof ObjectKeyValueEntity
     */
    setter?: string;

    /**
     * 如果有getter，则此值为getter方法的 toString
     * 
     * @type {string}
     * @memberof ObjectKeyValueEntity
     */
    getter?: string;

    /**
     * 
     * 修饰
     * @type {number}
     * @memberof ObjectKeyValueEntity
     */
    modifiers: number;
}

/**
 * 对应 PropertyDescriptor 的属性
 * 
 * @enum {number}
 */
const enum DescriptorModifier {
    Writable = 0b1,

    WritableShift = 0,
    Configurable = 0b10,

    ConfigurableShift = 1,
    Enumerable = 0b100,

    EnumerableShift = 2,
}


const enum ObjectType {
    Number = "number",
    String = "string",
    Boolean = "boolean",
    Undefined = "undefined",
    Null = "null",

    Function = "function",
}