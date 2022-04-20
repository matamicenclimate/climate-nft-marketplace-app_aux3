import { Button } from '@/componentes/Elements/Button/Button';
import { Form } from '@/componentes/Form/Form';
import { Input } from '@/componentes/Form/Inputs';
import { MainLayout } from '@/componentes/Layout/MainLayout';
import { RichTable } from '@/componentes/Layout/RichTable';
import { WalletFundsContext } from '@/context/WalletFundsContext';
import { Asset, Nft } from '@common/src/lib/api/entities';
import NetworkClient from '@common/src/services/NetworkClient';
import { none, option, some } from '@octantis/option';
import { Wallet } from 'algorand-session-wallet';
import axios, { Axios, AxiosError, AxiosResponse } from 'axios';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import Container from 'typedi';
import NftCause from '../components/NftCause';
import NftName from '../components/NftName';
import NftPrice from '../components/NftPrice';
import NftStatus from '../components/NftStatus';

function ProfileColumn({
  children,
  className,
  ...props
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>) {
  return (
    <div className={`basis-1/3 pr-12 ${className ?? ''}`.trim()} {...props}>
      {children}
    </div>
  );
}

function TransactionFrame({
  children,
  className,
  ...props
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>) {
  return (
    <div className={`basis-2/3 pl-12 ${className ?? ''}`.trim()} {...props}>
      {children}
    </div>
  );
}

export interface MyNftListProps {
  wallet: Wallet;
  account: string;
}

interface UserState {
  balance: number;
  projects: number;
}

const ProfileLoading = () => (
  <div className="flex p-4 flex-col items-center basis-1/2 shadow-lg rounded-xl bg-white animate-pulse">
    <h5 className="text-lg font-dinpro font-normal rounded w-full bg-climate-action-light">
      &nbsp;
    </h5>
    <p className="text-md m-2 font-normal font-dinpro w-full rounded bg-climate-action-light">
      &nbsp;
    </p>
    <p className="text-sm font-normal font-dinpro w-full rounded bg-climate-action-light">
      <a>&nbsp;</a>
    </p>
    <div className="flex pt-2 justify-evenly w-full">
      <div className=" flex w-full flex-col items-center p-2">
        <div className="bg-climate-action-light w-full rounded">&nbsp;</div>
        <p className="font-sanspro text-xs bg-climate-action-light rounded w-full mt-2">&nbsp;</p>
      </div>
      <div className="flex w-full flex-col items-center p-2">
        <div className="bg-climate-action-light w-full rounded">&nbsp;</div>
        <p className="font-sanspro text-xs bg-climate-action-light rounded w-full mt-2">&nbsp;</p>
      </div>
    </div>
    <div className="p-3 pt-4 w-full">
      <hr />
    </div>
    <div className="flex justify-center w-full">
      <a className="w-full p-1">
        <Button className="m-1 w-full" size="sm">
          &nbsp;
        </Button>
      </a>
      <a className="w-full p-1">
        <Button className="m-1 w-full" size="sm" variant="light">
          &nbsp;
        </Button>
      </a>
    </div>
  </div>
);

const createProfile = (account: string, wallet: Wallet, state: UserState) => (
  <div className="flex p-4 flex-col items-center basis-1/2 shadow-lg rounded-xl bg-white">
    <h5 className="text-lg font-dinpro font-normal text-climate-black-text">
      {wallet.displayName()}
    </h5>
    <p className="text-sm pb-2 font-normal font-dinpro text-climate-gray-light">
      <a target="_blank" rel="noreferrer" href={`https://algoexplorer.io/address/${account}`}>
        @{account.slice(0, 8)}...{account.slice(-8)}
      </a>
    </p>
    <div className="flex pt-2 justify-evenly">
      <div className=" flex flex-col items-center p-2">
        <p>{state.balance} €</p>
        <p className="font-sanspro text-xs text-climate-gray-artist">Total balance</p>
      </div>
      <div className="flex flex-col items-center p-2">
        <p>{state.projects}</p>
        <p className="font-sanspro text-xs text-climate-gray-artist">Projects backed</p>
      </div>
    </div>
    <div className="p-3 pt-4 w-full">
      <hr />
    </div>
    <div className="flex justify-center w-full">
      <a className="w-full p-1">
        <Button className="m-1 w-full" size="sm">
          Mint NFT
        </Button>
      </a>
      <a
        className="w-full p-1"
        target="_blank"
        rel="noreferrer"
        href={`https://algoexplorer.io/address/${account}`}
      >
        <Button className="m-1 w-full" size="sm" variant="light">
          Wallet
        </Button>
      </a>
    </div>
  </div>
);

function isAsset(assetOrNft: Asset | Nft): assetOrNft is Asset {
  return typeof (assetOrNft as unknown as Record<string, unknown>)['asset-id'] === 'number';
}
const net = Container.get(NetworkClient);

function errorIsAxios(err: unknown): err is AxiosError {
  const e = err as Record<string, unknown>;
  return e.isAxiosError === true && e.response != null;
}

async function retrying<A>(
  req: Promise<AxiosResponse<A>>,
  retries: number,
  total = retries
): Promise<AxiosResponse<A>> {
  try {
    return await req;
  } catch (err) {
    if (errorIsAxios(err)) {
      if (retries <= 0) {
        throw new Error(`Request failed after ${total} retries.`, {
          cause: err,
        });
      }
      console.warn(`Request ${err.config.url} failed ${retries}/${total}`);
      return retrying(axios(err.config), retries - 1, total);
    } else {
      throw err;
    }
  }
}

/**
 * A root component that shows a panel with information about the
 * minted user's NFTs, ongoing bids, sales...
 */
export default function MyNftList({ wallet, account }: MyNftListProps) {
  const { register } = useForm();
  const [user, setUser] = useState<option<UserState>>(none());
  const [nfts, setNfts] = useState<Record<string, Nft | Asset>>({});
  const funds = useContext(WalletFundsContext);
  const [info, setInfo] = useState('');
  useEffect(() => {
    if (funds != null) {
      setUser(
        some({
          projects: 0,
          balance: funds.balanceAlgoUSD ?? -1,
        })
      );
    }
  }, [funds]);
  useEffect(() => {
    (async () => {
      setInfo(`Preloading assets...`);
      const res = await retrying(
        net.core.get('assets', {
          query: {
            wallet: account,
          },
        }),
        10
      );
      setNfts(
        res.data.assets.reduce((map, asset) => {
          if (asset.amount > 0) {
            map[asset['asset-id'].toString()] = asset;
          }
          return map;
        }, {} as Record<string, Asset | Nft>)
      );
    })();
  }, []);
  useEffect(() => {
    const size = Object.keys(nfts).length;
    if (size === 0) return;
    const pending = [...Object.values(nfts)].filter((s) => isAsset(s)) as Asset[];
    setInfo(`Loaded ${size - pending.length} out of ${size} total assets...`);
    if (pending.length === 0) {
      setInfo(`Done! All assets loaded!`);
      setTimeout(() => {
        setInfo('');
      }, 3000);
    } else {
      const ad = pending.shift();
      const id = ad?.['asset-id']?.toString();
      if (id == null) {
        throw new Error(`Invalid data payload! This shouldn't be happening!`);
      }
      (async () => {
        console.info(`Fetching asset ${id}...`);
        const res = await retrying(
          net.core.get(`asset/:id`, {
            params: { id },
          }),
          10
        );
        setNfts({ ...nfts, [res.data.value.id.toString()]: res.data.value });
      })();
    }
  }, [nfts]);
  return (
    <MainLayout>
      <div className="flex flex-row w-full">
        <ProfileColumn className="flex">
          <div className="basis-1/2">&nbsp;</div>
          <div className="basis-1/2">
            {user.fold(<ProfileLoading />, (state) => createProfile(account, wallet, state))}
          </div>
        </ProfileColumn>
        <TransactionFrame className="flex">
          <div className="flex flex-col basis-3/4">
            <h2 className="text-4xl font-normal font-dinpro text-climate-black-title">My NFTs</h2>
            <div className="p-3 rounded-3xl bg-white shadow-lg mt-7">
              <Form onSubmit={async () => void 0}>
                <div className="flex justify-between">
                  <Input
                    className="basis-2/4"
                    register={register}
                    name="term"
                    type="search"
                    placeholder="Search"
                  />
                  <Link to="/mint">
                    <Button className="basis-1/3" size="sm" variant="inverted">
                      + Mint new NFT
                    </Button>
                  </Link>
                </div>
              </Form>
              <div
                className="text-climate-black-title font-thin font-dinpro text-xs ml-4 mt-2"
                style={{ marginBottom: '-2rem' }}
              >
                &nbsp;{info}
              </div>
              <RichTable
                order={['name', 'price', 'cause', 'status']}
                header={{
                  name: 'NFT Name',
                  price: 'Price / Type',
                  cause: 'Cause',
                  status: 'Status',
                }}
                rows={[...Object.values(nfts)].map((nft) => {
                  if (isAsset(nft)) {
                    const id = nft['asset-id'].toString();
                    return {
                      $id: id,
                      $class: 'animate-pulse',
                      name: (
                        <div className="flex">
                          <div className="mr-2 bg-climate-action-light rounded-lg w-10 h-10">
                            &nbsp;
                          </div>
                          <div className="flex flex-col w-6/12">
                            <div className="rounded mb-2 bg-climate-action-light">&nbsp;</div>
                            <div className="rounded bg-climate-action-light h-2">&nbsp;</div>
                          </div>
                        </div>
                      ),
                      price: (
                        <div className="flex flex-col">
                          <div className="mt-2 mb-4 flex justify-between">
                            <div className="bg-climate-action-light rounded w-full">&nbsp;</div>
                            <div className="ml-2 bg-climate-action-light rounded w-4">&nbsp;</div>
                          </div>
                          <hr />
                        </div>
                      ),
                      cause: <div className="rounded w-full bg-climate-action-light">&nbsp;</div>,
                      status: <div className="rounded w-full bg-climate-action-light">&nbsp;</div>,
                    };
                  }
                  const id = nft.id.toString();
                  return {
                    $id: id,
                    $class: '',
                    name: <NftName thumbnail={nft.image_url} title={nft.title} id={id} />,
                    price: <NftPrice price={nft.arc69.properties.price} type="auction" />,
                    cause: <NftCause id={nft.arc69.properties.cause} />,
                    status: <NftStatus status={nft.arc69.properties.app_id ? 'bidding' : 'sold'} />,
                  };
                })}
              />
            </div>
          </div>
          <div className="basis-1/4">&nbsp;</div>
        </TransactionFrame>
      </div>
    </MainLayout>
  );
}