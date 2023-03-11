import { initRootState } from "@/packages/feature/state/Root";
import { SystemStateEnum } from "@/packages/type/enum"
import { nextTick, reactive, watch } from "vue";
import { RootState, SystemOptions, WinApp, WinAppOptions } from "@/packages/type/type";
import { initEventer, Eventer, initEventListener, emitEvent, mountEvent } from "@packages/feature/event";
import {  VtronFileSystem } from "../addon/FileSystem";
import { initAppList } from "@/packages/hook/useAppOpen";
import vtronLogoIcon from "@/assets/vtron-icon-nobg.png?url";

let GLOBAL_SYSTEM: System | null = null;

export type VtronPlugin = (system: System, rootState: RootState) => void

/**
 * @description: System 类，在初始化的过程中需要提供挂载点，以及一些配置
 */
class System {
    readonly _options: SystemOptions;
    private _rootState: RootState;
    private _eventer: Eventer;
    private _ready: ((value: System) => void) | null = null;
    private _error: ((reason: unknown) => void) | null = null;
    private _readyToUpdata: boolean = false;
    private _flieOpenerMap: Map<string, (path: string, content: string) => void> = new Map();
    isFirstRun: boolean = true;
    ref!: HTMLElement;
    fs!: VtronFileSystem;
    constructor(options?: SystemOptions) {
        this._options = this.initOptions(options);
        this._rootState = this.initRootState(options);

        this._eventer = this.initEvent(options);

        this.initSystem(options);
        this.firstRun();
        this.setRef(this._rootState.ref!);
    }
    setRef(ref: HTMLElement) {
        this.ref = ref;
    }
    /**
     * @description: pure 初始化配置选项
     */
    private initOptions(options?: SystemOptions) {
        let tempOptions = Object.assign({
            background: "#3A98CE"
        }, options);
        return tempOptions;
    }
    /**
     * @description: 获取系统配置
     */
    private initRootState(options?: SystemOptions): RootState {
        return initRootState(this._options);
    }
    /**
     * @description: 初始化系统
     */
    private async initSystem(options?: SystemOptions) {
        /**
         * 过程：激活屏幕，桥接事件。
         */
        this._rootState.system.state = SystemStateEnum.opening;
        initEventListener();
        this.registerFileOpener('link', this.openLink.bind(this))
        GLOBAL_SYSTEM = this;

        this.fs = await this.initFileSystem();
        this.initApp();
        initAppList();
        this._rootState.system.state = SystemStateEnum.open;
        this._ready && this._ready(this);
    }
    /**
     * @description: 初始化事件系统
     */
    private initEvent(options?: SystemOptions) {
        /**
         * 过程：监听事件，处理事件
         */
        return initEventer();
    }
    private initApp() {
        this._rootState.system.options.desktop?.forEach((item) => {
            this.addApp(item);
        })
        this._rootState.system.options.magnet?.forEach((item) => {
            this.addMagnet(item);
        })
        this._rootState.system.options.menulist?.forEach((item) => {
            this.addMenuList(item);
        })
    }
    private async initFileSystem(){
        let res = await new VtronFileSystem().whenReady()
        await res.mkdir('/C');
        await res.mkdir('/C/Users');
        await res.mkdir('/C/Users/Desktop');
        await res.mkdir('/C/Users/Magnet');
        await res.mkdir('/C/Users/Menulist');
        res.registerWatcher(/^\/C\/Users\//,(path,content)=>{
            initAppList();
        })
        return res;
    }
    private addWindowSysLink(loc: string, options: WinAppOptions) {
        if (this.isFirstRun) {
            this.fs.writeFile(`/C/Users/${loc}/` + options.name, {
                name: options.name,
                icon: options.icon || vtronLogoIcon,
                type: 'link',
                content: `link:${loc}:${options.name}`
            });
        }
        this._rootState.system.windowMap[loc].set(options.name, options.window);
    }
    /**
     * @description: 添加应用
     */
    addApp(options: WinAppOptions) {
        this.addWindowSysLink('Desktop', options);
    }
    addMagnet(options: WinAppOptions) {
        this.addWindowSysLink('Magnet', options);
    }
    addMenuList(options: WinAppOptions) {
        this.addWindowSysLink('Menulist', options);
    }

    whenReady(): Promise<System> {
        return new Promise<System>((resolve, reject) => {
            this._ready = resolve;
            this._error = reject;
        })
    }
    firstRun() {
        if (localStorage.getItem('vtronFirstRun')) {
            this.isFirstRun = false;
            return false;
        } else {
            this.isFirstRun = true;
            localStorage.setItem('vtronFirstRun', 'true');
            emitEvent('firstRun');
            return true;
        }
    }
    shutdown() {
        this._rootState.system.state = SystemStateEnum.close;
    }
    reboot() {
        this.fs.removeFileSystem();
        localStorage.removeItem('vtronFirstRun');
        this._rootState.system.state = SystemStateEnum.close;
        window.location.reload();
    }
    emitEvent(event: string, ...args: any[]) {
        emitEvent(event, ...args);
    }
    mountEvent(event: string, callback: (...args: any[]) => void) {
        mountEvent(event, callback);
    }
    registerFileOpener(type: string, func: (path: string, content: string) => void) {
        this._flieOpenerMap.set(type, func);
    }
    openLink(path: string, content: string) {
        this._rootState.system.windowMap[
            content.split(':')[1]
        ].get(content.split(':')[2])?.show();
    }
    /**打开vtron 文件系统的文件 */
    openFile(path: string) {
        this.fs.stat(path).then((res) => {
            this._flieOpenerMap.get(res?.type||'link')?.(path, res?.content || '');
        })
    }
    // 插件系统
    use(func: VtronPlugin): void {
        return func(this, this._rootState);
    }
}
function useSystem() {
    return GLOBAL_SYSTEM;
}
export { System, useSystem };