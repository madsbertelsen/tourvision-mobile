import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import App, { DocumentLayout, Home } from './App';
import { Orchestrator } from './pages/Orchestrator';
import './styles/global.scss';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

render(() => (
  <Router root={App}>
    <Route path="/" component={Home} />
    <Route path="/orchestrator" component={Orchestrator} />
    {/* Use nested route so DocumentLayout stays mounted when navigating to map */}
    <Route path="/:docId" component={DocumentLayout}>
      <Route path="/" />
      <Route path="/map/:mapId" />
      <Route path="/map/:mapId/location/:locId" />
    </Route>
  </Router>
), root);
