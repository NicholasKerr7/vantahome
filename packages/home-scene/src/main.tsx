import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceViewport } from './DeviceViewport';
import PlacementEditor from './placement/PlacementEditor';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application mount point is missing.');
const placementMode = window.location.hash === '#placement';
document.documentElement.classList.toggle('placement-document', placementMode);
ReactDOM.createRoot(root).render(<React.StrictMode>{placementMode ? <PlacementEditor /> : <DeviceViewport><App /></DeviceViewport>}</React.StrictMode>);
