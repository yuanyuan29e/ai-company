import React from 'react';
import { CompanionProvider } from '@/contexts/CompanionContext';
import PlayerPage from '@/components/Layout/PlayerPage';

function App() {
  return (
    <CompanionProvider>
      <PlayerPage />
    </CompanionProvider>
  );
}

export default App;
