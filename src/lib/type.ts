import { Wallet } from 'algorand-session-wallet';

export type assetInfoType = {
  transactionId: string | undefined;
  assetID: number | undefined;
};

export type metadataNFTType = {
  arc69: {
    description: string;
    external_url: string;
    mime_type: string;
    properties: Record<string, unknown> & {
      cause: string;
      causePercentage: number;
      date: Date;
      price: number;
      artist: string;
      file: {
        name: string;
        type: string;
        size: number;
      };
    };
  };
  image_url: string;
  ipnft: string;
  url: string;
};

export type CauseInfo = {
  cause: string;
  causePercentage: number;
  price: number;
};

type Properties = Record<string, any> & CauseInfo;

export type NFTMetadataBackend = {
  title: string;
  description: string;
  author: string;
  price: number;
  file: FileList;
  properties: Properties;
  image_url: string;
  ipnft: string;
  url: string;
};

export type MinterProps = {
  wallet: Wallet | undefined;
  account: string | undefined | null;
};
