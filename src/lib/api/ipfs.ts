import { metadataNFTType } from '../type';

export interface IPFSResponse extends metadataNFTType {}
export interface Arc69 {
  standard: string;
  description: string;
  external_url: string;
  mime_type: string;
  properties: Properties;
}
export interface Properties {
  file: File;
  artist: string;
}
export interface File {
  name: string;
  type: string;
  size: number;
}
