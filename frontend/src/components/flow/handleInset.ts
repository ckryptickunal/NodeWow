import type { CSSProperties } from 'react';

/** RF defaults use translateY(±50%), which leaves half the handle outside the node and it gets clipped. */
export const rfHandleTopStyle: CSSProperties = {
  top: 8,
  left: '50%',
  transform: 'translateX(-50%)',
};

export const rfHandleBottomStyle: CSSProperties = {
  bottom: 8,
  left: '50%',
  transform: 'translateX(-50%)',
};
