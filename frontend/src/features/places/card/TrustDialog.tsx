import type { PlaceDetail } from '@/shared/api';
import { Modal } from '@/shared/ui';

import { TrustBlock } from './TrustBlock';
import { VerificationBlock } from './VerificationBlock';

interface TrustDialogProps {
  open: boolean;
  onClose: () => void;
  place: PlaceDetail;
}

/**
 * «Достоверность» from the card menu: status, votes, where the publication comes from and
 * the residents' check — for cards that keep these out of the body (events).
 */
export function TrustDialog({ open, onClose, place }: TrustDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="Достоверность">
      <div className="flex flex-col gap-4">
        <TrustBlock place={place} />
        <VerificationBlock place={place} />
      </div>
    </Modal>
  );
}
