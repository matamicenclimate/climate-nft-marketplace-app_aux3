import { Dialog } from '@/componentes/Dialog/Dialog';
import { Spinner } from '@/componentes/Elements/Spinner/Spinner';
import ProcessDialog from '@/service/ProcessDialog';
import { ReactNode, useState } from 'react';
import Container from 'typedi';

const service = Container.get(ProcessDialog);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('...');
  const [title, setTitle] = useState('Processing...');
  const [red, setRed] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  service.setOpen = setOpen;
  service.setMessage = setMessage;
  service.setTitle = setTitle;
  service.setRed = setRed;
  service.setSubtitle = setSubtitle;
  return (
    <>
      <Dialog subtitle={subtitle} isOpen={open} title={title}>
        {message}
        <div className="flex justify-center mt-3">
          <Spinner size="lg" />
        </div>
      </Dialog>
      {children}
    </>
  );
}
