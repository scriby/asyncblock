declare module _ab {
  module ab {
    interface Result<T> {
      sync(options?: TaskOptions): T;
      defer(options?: TaskOptions): T;
    }

    function enableTransform(module: any): boolean;
    function getCurrentFlow(): Flow;
    function ifError(callback: Function): Function;
    function nostack<T>(run: (flow: ab.Flow) => T, done?: Function): ab.Result<T>;
    function nostack<T>(run: () => T, done?: Function): ab.Result<T>;

    interface TaskOptions {
      ignoreError?: boolean;
      key?: any;
      responseFormat?: string[];
      timeout?: number;
      timeoutIsError?: boolean;
      dontWait?: boolean;
      firstArgIsError?: boolean;
    }

    interface Flow {
      add(): any;
      add(options: TaskOptions): any;
      add(key: any): any;

      callback(): any;
      callback(options: TaskOptions): any;
      callback(key: any): any;

      set(): Function;
      set(options: TaskOptions): Function;
      set(key: any): Function;
      set(key: any, responseFormat: string[]): Function;

      wait(): any;
      wait(key: any): any;

      get(key: any): any;

      del(key: any): any;

      sync(func: any): any;

      queue(options: TaskOptions, exec: Function): void;
      queue(key: any, exec: Function): void;
      queue(exec: Function): void;

      maxParallel: number;
      errorCallback: Function;
      taskTimeout: number;
      timeoutIsError: boolean;

      //task timeout (event = taskTimeout)
      on(event: string, handler: (info: {
        key: any; runtime: number
      }) => void): void ;

      doneAdding(): void;
      forceWait(): any;
    }
  }

  function ab<T>(run: (flow: ab.Flow) => T, done?: Function): ab.Result<T>;
  function ab<T>(run: () => T, done?: Function): ab.Result<T>;
}

declare module "asyncblock" {
  import ab = _ab.ab;
  export = ab;
}