import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceViewport } from './DeviceViewport';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application mount point is missing.');
ReactDOM.createRoot(root).render(<React.StrictMode><DeviceViewport><App /></DeviceViewport></React.StrictMode>);
