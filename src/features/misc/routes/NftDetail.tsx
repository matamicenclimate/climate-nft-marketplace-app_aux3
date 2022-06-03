import { Button } from '@/componentes/Elements/Button/Button';
import { useCauseContext } from '@/context/CauseContext';
import { Spinner } from '@/componentes/Elements/Spinner/Spinner';
import { MainLayout } from '@/componentes/Layout/MainLayout';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import algoLogo from '../../../assets/algoLogo.svg';
import { none, option, some } from '@octantis/option';
import Container from 'typedi';
import '@common/src/lib/binary/extension';
import { useWalletContext } from '@/context/WalletContext';
import { CauseDetail } from '@/componentes/CauseDetail/CauseDetail';
import Fold from '@/componentes/Generic/Fold';
import { TransactionOperation } from '@common/src/services/TransactionOperation';
import { Case, Match } from '@/componentes/Generic/Match';
import { AuctionAppState } from '@common/src/lib/types';
import useOptionalState from '@/hooks/useOptionalState';
import CurrentNFTInfo from '../state/CurrentNFTInfo';
import NftDetailPreview from '../components/NftDetailPreview';
import { useTranslation } from 'react-i18next';
import NetworkClient from '@common/src/services/NetworkClient';
import { retrying } from '@common/src/lib/net';
import { Nft } from '@common/src/lib/api/entities';
import { Cause, CausePostBody } from '@/lib/api/causes';
import { microalgosToAlgos } from '../lib/minting';
import { useNFTPurchasingActions } from '../lib/detail';

const getDateObj = (mintingDate: any) => {
  const date = new Date(mintingDate);
  const day = date.getDate();
  const monthName = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return `Minted on ${day} ${monthName} ${year}`;
};

const net = Container.get(NetworkClient);

async function tryGetNFTData(
  id: string,
  nft: option<CurrentNFTInfo>,
  setNft: (nft: CurrentNFTInfo) => void,
  setError: (err: unknown) => void
) {
  try {
    const {
      data: { value: nft },
    } = await retrying(net.core.get('asset/:id', { params: { id } }), 10);
    const appId = nft.arc69.properties.app_id;
    if (appId == null) {
      return setNft({ state: none(), nft });
    }
    const state = await TransactionOperation.do.getApplicationState<AuctionAppState>(appId);
    setNft({ state: some(state), nft });
  } catch (err) {
    setError(err);
  }
}

let sideTimer: NodeJS.Timeout | null = null;
export const NftDetail = () => {
  const { t } = useTranslation();
  const { causes } = useCauseContext();
  const { ipnft: assetId } = useParams() as { ipnft: string };
  const [nft, setNft] = useOptionalState<CurrentNFTInfo>();
  const [error, setError, resetError] = useOptionalState<unknown>();
  const { wallet, walletAccount } = useWalletContext();

  const now = Date.now() / 1000;

  function updateNFTInfo() {
    return tryGetNFTData(assetId, nft, setNft, setError);
  }
  useEffect(() => {
    updateNFTInfo();
  }, []);
  useEffect(() => {
    for (const data of nft) {
      if (!data.state.isDefined()) {
        if (sideTimer != null) {
          clearTimeout(sideTimer);
        }
        sideTimer = setTimeout(() => {
          updateNFTInfo();
        }, 1 * 60 * 1000);
      }
    }
  }, [nft]);

  const { doBuyNFT, doPlaceABid } = useNFTPurchasingActions(assetId, wallet, nft, updateNFTInfo);

  const getCause = (causes: Cause[] | undefined, nft: Nft) => {
    const cause: Cause | undefined = causes?.find(
      (cause: Cause) => cause.id === nft?.arc69?.properties?.cause
    );
    return cause as CausePostBody;
  };

  return (
    <MainLayout>
      <Fold
        option={error}
        as={(e) => <div className="text-red-600 flex justify-center">Error: {`${e}`}</div>}
      />
      <Fold
        option={nft}
        as={(detail) => (
          <div className="grid grid-cols-3 gap-4">
            <div className="left col-span-2 flex justify-center">
              <div className="w-[670px]">
                <div>
                  <div className="py-14">
                    <h4 className="font-dinpro font-normal text-2xl">
                      {t('NFTDetail.Overview.nftDescription')}
                    </h4>
                  </div>
                  <div>
                    <p className="font-sanspro font-normal text-sm ">
                      {detail.nft.arc69.description}
                    </p>
                  </div>
                  <div>
                    <div className="py-14">
                      <h4 className="font-dinpro font-normal text-2xl">
                        {t('NFTDetail.Overview.nftCause')}
                      </h4>
                    </div>
                    <div className="w-[650px]">
                      <CauseDetail
                        title={getCause(causes, detail.nft)?.title}
                        imageUrl={getCause(causes, detail.nft)?.imageUrl}
                        description={getCause(causes, detail.nft)?.description}
                        wallet={getCause(causes, detail.nft)?.wallet}
                      />
                    </div>
                  </div>
                  <div className="image w-[650px] h-[580px]">
                    <div className="py-14 flex justify-between font-dinpro">
                      <h4 className="font-normal text-2xl">
                        {t('NFTDetail.Overview.nftResources')}
                      </h4>
                      <p className="self-center font-normal text-climate-gray-light text-lg">
                        {getDateObj(detail.nft.arc69.properties.date)}
                      </p>
                    </div>
                    <div className="w-full min-h-[580px] max-h-[580px] object-cover mr-8 rounded-lg">
                      <NftDetailPreview nft={nft} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="right-4 col-span-1">
              <div className="rounded-xl p-5 h-[690px] w-[370px] bg-white shadow-[3px_-5px_40px_0px_rgba(205, 205, 212, 0.3)]">
                <div className="image w-[330px] h-[345px]">
                  <NftDetailPreview nft={nft} />
                </div>
                <div className="p-3">
                  <div className="cardText">
                    <div className="bg-white">
                      <div className="font-sanspro font-semibold text-climate-green flex items-baseline">
                        <span className="h-2 w-2 bg-climate-green rounded-full inline-block mr-1 self-center"></span>
                        <p className="whitespace-nowrap overflow-hidden truncate text-ellipsis">
                          {getCause(causes, detail.nft)?.title}
                        </p>
                      </div>
                      <h4 className="py-2 text-4xl font-dinpro font-normal uppercase truncate text-ellipsis ">
                        {detail.nft.title}
                      </h4>
                      <div className="font-sanspro text-climate-gray-artist text-sm truncate text-ellipsis">
                        @{detail.nft.arc69.properties.artist}
                      </div>
                    </div>
                  </div>
                  <div className="offerBid flex justify-between py-7">
                    <div className="flex flex-col">
                      <label
                        className="font-sanspro text-climate-gray-artist text-sm pb-4"
                        htmlFor="title"
                      >
                        Offer Bid
                      </label>
                    </div>
                    <div className="flex self-end">
                      <p className="text-xl text-climate-blue self-center">
                        {detail.state.fold(void 0, (_) => _.bid_amount) ??
                          microalgosToAlgos(detail.nft.arc69.properties.price)}
                      </p>
                      <img className="w-4 h-4 self-center ml-1" src={algoLogo} alt="algologo" />
                    </div>
                  </div>
                  {detail.state.fold(
                    <div>
                      <h4>The asset is being processed</h4>
                      <p>Wait some time before it gets ready.</p>
                    </div>,
                    () => null
                  )}
                  <Fold
                    option={detail.state}
                    as={(state) => (
                      <div className="buttons">
                        <Button
                          disabled={
                            walletAccount == null ||
                            walletAccount == '' ||
                            detail.nft.creator === walletAccount ||
                            state.end < now
                          }
                          onClick={doPlaceABid}
                          className="w-full text-2xl text-climate-white mt-8 font-dinpro"
                        >
                          <span>
                            <Match>
                              <Case of={detail.nft.creator === walletAccount}>
                                This is your own NFT
                              </Case>
                              <Case of={walletAccount == null || walletAccount == ''}>
                                Connect your wallet
                              </Case>
                              <Case of={state.end < now}>The auction has ended</Case>
                              <Case of="default">Place Bid</Case>
                            </Match>
                          </span>
                        </Button>
                        <Match>
                          <Case of={state.end < now}>
                            <span className="text-gray-500 text-sm">
                              Ended {new Date(state.end * 1000).toLocaleString()}
                            </span>
                          </Case>
                        </Match>
                      </div>
                    )}
                  />
                  <Button onClick={doBuyNFT}>Buy</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      >
        <div className="flex justify-center">
          <Spinner size="lg" />
        </div>
      </Fold>
    </MainLayout>
  );
};
