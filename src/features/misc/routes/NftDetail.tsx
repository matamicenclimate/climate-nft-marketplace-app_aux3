import { Button } from '@/componentes/Elements/Button/Button';
import { Spinner } from '@/componentes/Elements/Spinner/Spinner';
import { MainLayout } from '@/componentes/Layout/MainLayout';
import { NFTListed } from '@/lib/api/nfts';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import algoLogo from '../../../assets/algoLogo.svg';
import algosdk from 'algosdk';
import { client } from '@/lib/algorand';
import { none, option, some } from '@octantis/option';
import * as WalletAccountProvider from '@common/src/services/WalletAccountProvider';
import Container from 'typedi';
import ProcessDialog from '@/service/ProcessDialog';
import '@common/src/lib/binary/extension';
import { WalletContext } from '@/context/WalletContext';
import { CauseDetail } from '@/componentes/CauseDetail/CauseDetail';
import { useQuery } from 'react-query';
import { fetchNfts } from '@/lib/NFTFetching';
import { isVideo } from '@/lib/media';
import Fold from '@/componentes/Generic/Fold';
import OptInService from '@common/src/services/OptInService';
import { TransactionOperation } from '@common/src/services/TransactionOperation';
import { Case, Match } from '@/componentes/Generic/Match';
import { AuctionAppState } from '@common/src/lib/types';
import useOptionalState from '@/hooks/useOptionalState';
import CurrentNFTInfo from '../state/CurrentNFTInfo';
import NftDetailPreview from '../components/NftDetailPreview';

const getDateObj = (mintingDate: any) => {
  const date = new Date(mintingDate);
  const day = date.getDate();
  const monthName = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return `Minted on ${day} ${monthName} ${year}`;
};

/**
 * Returns true if the passed array is all-zero.
 */
function isZeroAccount(account: Uint8Array) {
  return account.reduce((a, b) => a + b, 0) === 0;
}

export const NftDetail = () => {
  const { ipnft: assetId } = useParams();
  const { data: queryData } = useQuery('nfts', fetchNfts);
  const data: NFTListed[] | undefined = useMemo(() => {
    return queryData?.map((nft) => ({ ...nft, image_url: isVideo(nft.image_url) }));
  }, [queryData]);
  // const [nft, setNft] = useState<option<CurrentNFTInfo>>(none());
  const [nft, setNft] = useOptionalState<CurrentNFTInfo>();
  // const [error, setError] = useState<option<unknown>>(none());
  const [error, setError, resetError] = useOptionalState<unknown>();
  const wallet = useContext(WalletContext);
  const now = Date.now() / 1000;

  useEffect(() => {
    if (assetId != null && data != null) {
      resetError();
      const nft = data.find((i) => i.id === Number(assetId));
      if (nft != null && nft.arc69.properties.app_id != null) {
        TransactionOperation.do
          .getApplicationState<AuctionAppState>(nft.arc69.properties.app_id)
          .then((state) => {
            setNft({ nft, state });
          });
      } else {
        setError(
          `Invalid asset ${assetId}, no application found for the provided asset identifier.`
        );
      }
    }
  }, [assetId, data]);

  // Test: Place a bid!
  async function doPlaceABid() {
    const dialog = Container.get(ProcessDialog);
    if (!nft.isDefined()) {
      return alert(`Can't place a bid! App index couldn't be setted.`);
    }
    const appId = nft.value.nft.arc69.properties.app_id;
    if (appId == null) {
      return alert(`Attempting to place a bid on an invalid asset.`);
    }
    const appAddr = algosdk.getApplicationAddress(appId);
    let previousBid: option<string> = none();
    const state = nft.value.state;
    if (state == null) return;
    if (!isZeroAccount(state.bid_account)) {
      previousBid = some(algosdk.encodeAddress(state.bid_account));
    }
    console.info('Previous bidder:', previousBid.getOrElse('<none>'));
    const minRequired = (state.bid_amount ?? state.reserve_amount) + (state.min_bid_inc ?? 10);
    let bidAmount = 0;
    while (bidAmount < minRequired || Number.isNaN(bidAmount) || !Number.isFinite(bidAmount)) {
      const result = prompt(
        `Enter a bid amount (At least ${minRequired}!):`,
        minRequired.toString()
      );
      if (result === null) {
        return alert('Aborting the bidding process');
      }
      bidAmount = Number(result);
      if (bidAmount < minRequired || Number.isNaN(bidAmount) || !Number.isFinite(bidAmount)) {
        alert('Please enter a valid amount and try again!');
      }
    }
    const account = WalletAccountProvider.get().account;
    await dialog.process(async function () {
      const aId = Number(assetId);
      if (Number.isNaN(aId)) {
        throw new Error(`Invalid asset selected: No asset ID provided or passed a wrong format!`);
      }
      if (wallet?.userWallet?.wallet == null) {
        return alert('First connect your wallet!');
      }
      this.title = `Placing a bid (${bidAmount} μAlgo)`;
      this.message = 'Making the payment....';
      const payTxn = await algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: account.addr,
        to: appAddr,
        amount: bidAmount,
        suggestedParams: await client().getTransactionParams().do(),
      });
      this.message = `Making application call...`;
      console.log(`Smart contract wallet: ${appAddr}`);
      console.log(
        `Using this smart contract: https://testnet.algoexplorer.io/application/${appId}`
      );
      const callTxn = await algosdk.makeApplicationCallTxnFromObject({
        from: account.addr,
        appIndex: appId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs: ['bid'.toBytes()],
        foreignAssets: [state.nft_id],
        accounts: previousBid.fold([], (s) => [s]),
        suggestedParams: await client().getTransactionParams().do(),
      });
      const optTxn = await Container.get(OptInService).createOptInRequest(aId);
      const txns = algosdk.assignGroupID([payTxn, callTxn, optTxn]);
      const signedTxn = await wallet.userWallet.wallet.signTxn(txns);
      const { txId } = await client()
        .sendRawTransaction(signedTxn.map((tx) => tx.blob))
        .do();
      this.message = `Waiting for confirmation...`;
      try {
        await algosdk.waitForConfirmation(client(), txId, 10);
        this.message = `Done!`;
        await fetchNfts();
      } catch {
        this.message = `FATAL! Could not send your transaction.`;
        await new Promise((r) => setTimeout(r, 1000));
      }
      await new Promise((r) => setTimeout(r, 1000));
    });
  }
  return (
    <MainLayout>
      <Fold option={error} as={(e) => <div className="text-red-600">Error: {`${e}`}</div>} />
      <Fold
        option={nft}
        as={(detail) => (
          <div className="grid grid-cols-3 gap-4">
            <div className="left col-span-2 flex justify-center">
              <div className="w-[670px]">
                <div>
                  <div className="py-14">
                    <h4 className="font-dinpro font-normal text-2xl">Description</h4>
                  </div>
                  <div>
                    <p className="font-sanspro font-normal text-sm ">
                      {detail.nft.arc69.description}
                    </p>
                  </div>
                  <div>
                    <div className="py-14">
                      <h4 className="font-dinpro font-normal text-2xl">Causes</h4>
                    </div>
                    <div className="w-[650px]">
                      <CauseDetail nftDetailCause={detail.nft.arc69.properties.cause} />
                    </div>
                  </div>
                  <div className="image w-[650px] h-[580px]">
                    <div className="py-14 flex justify-between font-dinpro">
                      <h4 className="font-normal text-2xl">Resources</h4>
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
            <div className="right-40 col-span-1">
              <div className="rounded-xl p-5 h-[715px] w-[370px] bg-white shadow-[3px_-5px_40px_0px_rgba(205, 205, 212, 0.3)]">
                <div className="image w-[330px] h-[345px]">
                  <NftDetailPreview nft={nft} />
                </div>
                <div className="p-3">
                  <div className="cardText">
                    <div className="bg-white">
                      <div className="font-sanspro font-semibold text-climate-green flex items-baseline">
                        <span className="h-2 w-2 bg-climate-green rounded-full inline-block mr-1 self-center"></span>
                        <p className="whitespace-nowrap overflow-hidden truncate text-ellipsis">
                          {detail.nft.arc69.properties.cause}
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
                      {/* <input
                className="shadow appearance-none border border-gray-500 rounded-xl w-36 py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                id="title"
                type="text"
                placeholder={`${smartContractState.fold(
                  nftSelected?.arc69?.properties?.price,
                  (state) => state.bid_amount
                )}`}
              /> */}
                    </div>
                    <div className="flex self-end">
                      <p className="text-xl text-climate-blue self-center">
                        {detail.state.bid_amount ?? detail.nft.arc69.properties.price}
                      </p>
                      <img className="w-4 h-4 self-center ml-1" src={algoLogo} alt="algologo" />
                    </div>
                  </div>
                  <div className="buttons">
                    <Button
                      disabled={
                        wallet?.userWallet?.account == null ||
                        wallet?.userWallet?.account == '' ||
                        detail.nft.creator === wallet?.userWallet?.account ||
                        detail.state.end < now
                      }
                      onClick={doPlaceABid}
                      className="w-full text-2xl text-climate-white mt-8 font-dinpro"
                    >
                      <span>
                        <Match>
                          <Case of={detail.nft.creator === wallet?.userWallet?.account}>
                            This is your own NFT
                          </Case>
                          <Case
                            of={
                              wallet?.userWallet?.account == null ||
                              wallet?.userWallet?.account == ''
                            }
                          >
                            Connect your wallet
                          </Case>
                          <Case of={detail.state.end < now}>The auction has ended</Case>
                          <Case of="default">Place Bid</Case>
                        </Match>
                      </span>
                    </Button>
                    <Match>
                      <Case of={detail.state.end < now}>
                        <span className="text-gray-500 text-sm">
                          Ended {new Date(detail.state.end * 1000).toLocaleString()}
                        </span>
                      </Case>
                    </Match>
                  </div>
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
