declare module "thrift" {
  export const Thrift: any;
  export const TBinaryProtocol: any;
  export const TBufferedTransport: any;

  const thrift: {
    Thrift: any;
    TBinaryProtocol: any;
    TBufferedTransport: any;
    [key: string]: any;
  };

  export default thrift;
}
