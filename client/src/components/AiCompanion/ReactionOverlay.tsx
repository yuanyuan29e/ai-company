import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { ActiveReaction } from '@/types';
import ReactionBubble from './ReactionBubble';

interface ReactionOverlayProps {
  reactions: ActiveReaction[];
}

export default function ReactionOverlay({ reactions }: ReactionOverlayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="absolute bottom-28 right-36 z-25 flex flex-col-reverse gap-2.5 max-h-[320px] overflow-hidden pointer-events-none">
      <AnimatePresence mode="popLayout">
        {reactions.slice(-3).map((reaction, index) => (
          <ReactionBubble
            key={reaction.id}
            reaction={reaction}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
