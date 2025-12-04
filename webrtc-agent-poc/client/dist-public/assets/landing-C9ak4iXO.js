import"./modulepreload-polyfill-B5Qt9EMX.js";class P{constructor(t){this.iframes=[],this.tabsContainer=null,this.overlayContainer=null,this.phoneScreen=null,this.commentDismissTimer=null,this.playerFrame=null,this.hasSecondPhone=!1,this.messageHandler=null,this.currentStep=0,this.isPlaying=!1,this.isPausedState=!1,this.iframesReady=[],this.keyboardHandler=null,this.pauseButton=null,this.snapshots=new Map,this.currentActionIndex=0,this.pendingCommand=null,this.options=t,this.container=t.container,this.sessionId=t.sessionId||Math.random().toString(36).substring(2,10),console.log("[DemoPlayer] Session ID:",this.sessionId),this.createDOM(),this.setupMessageListener(),this.setupKeyboardListener(),t.autoStart!==!1&&this.waitForReady().then(()=>this.start())}createDOM(){const{steps:t,editorUrl:e,demoScript:o,dualPhone:n,enableSync:a,offlineMode:i}=this.options,s=n?2:1,r=i?"&offline=true":"",l=document.createElement("div");l.className="demo-player",this.tabsContainer=document.createElement("div"),this.tabsContainer.className="demo-tabs",t.forEach((h,m)=>{const p=document.createElement("button");p.className="demo-tab"+(m===0?" active":""),p.textContent=h.label,p.dataset.step=String(m),p.addEventListener("click",()=>this.goToStep(m)),this.tabsContainer.appendChild(p)});const c=document.createElement("div");c.className="player-frame"+(n?" dual-phone":""),this.playerFrame=c;const d=[{name:"Alice",color:"#3b82f6"},{name:"Bob",color:"#10b981"}];for(let h=0;h<s;h++){const m=document.createElement("div");m.className="phone-wrapper";const p=document.createElement("div");p.className="phone-mockup";const b=document.createElement("div");b.className="phone-screen";const y=document.createElement("iframe");let w="";if(n){const g=h===1;w=`&enableSync=true&demoUser=${h+1}${g?"&observeOnly=true":""}`}else a&&(w="&enableSync=true&demoUser=1");y.src=`${e}?autoplay=true&remoteControl=true&demo=${o}&showToolbar=true${w}${r}`,y.setAttribute("frameborder","0"),y.setAttribute("allowfullscreen","true");const S=document.createElement("div");if(S.className="home-indicator",b.appendChild(y),b.appendChild(S),p.appendChild(b),m.appendChild(p),n||a){const g=d[h],v=document.createElement("div");v.className="phone-label",v.innerHTML=`
          <span class="phone-label-avatar" style="background-color: ${g.color}">${g.name[0]}</span>
          <span class="phone-label-name">${g.name}</span>
        `,m.appendChild(v)}c.appendChild(m),this.iframes.push(y),this.iframesReady.push(!1),h===0&&(this.phoneScreen=b)}this.overlayContainer=document.createElement("div"),this.overlayContainer.className="speech-bubble-overlay",this.overlayContainer.innerHTML=`
      <div class="speech-bubble">
        <div class="bubble-content">
          <div class="comment-heading"></div>
          <div class="comment-text"></div>
        </div>
        <div class="bubble-footer">
          <div class="countdown-ring">
            <svg viewBox="0 0 36 36">
              <circle class="countdown-bg" cx="18" cy="18" r="16" />
              <circle class="countdown-progress" cx="18" cy="18" r="16" />
            </svg>
            <span class="tap-hint">Tap</span>
          </div>
        </div>
        <div class="bubble-tail"></div>
      </div>
    `,this.overlayContainer.addEventListener("click",()=>{this.hideComment()}),this.pauseButton=document.createElement("div"),this.pauseButton.className="pause-button",this.pauseButton.innerHTML=`
      <svg class="play-icon" width="48" height="48" viewBox="0 0 24 24" fill="white">
        <polygon points="5,3 19,12 5,21" />
      </svg>
      <svg class="pause-icon" width="48" height="48" viewBox="0 0 24 24" fill="white">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    `,this.pauseButton.addEventListener("click",()=>{this.togglePause()});const f=document.createElement("div");f.className="player-content",f.appendChild(c),f.appendChild(this.pauseButton),f.appendChild(this.overlayContainer),l.appendChild(this.tabsContainer),l.appendChild(f),this.injectStyles(),this.container.appendChild(l)}injectStyles(){const t="demo-player-styles";if(document.getElementById(t))return;const e=document.createElement("style");e.id=t,e.textContent=`
      .demo-player {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        width: 100%;
      }

      .player-content {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
      }

      .player-frame {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 40px;
        min-width: 800px;
        padding: 40px;
        min-height: 500px;
      }

      .player-frame.dual-phone {
        min-width: 700px;
      }

      .player-frame.dual-phone .phone-mockup {
        width: 240px;
      }

      .demo-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .demo-tab {
        padding: 8px 16px;
        border: 1.5px solid #E5E7EB;
        border-radius: 20px;
        background: white;
        font-size: 14px;
        font-weight: 500;
        color: #6B7280;
        cursor: pointer;
        transition: all 0.2s;
      }

      .demo-tab:hover {
        border-color: #9CA3AF;
      }

      .demo-tab.active {
        background: #111827;
        border-color: #111827;
        color: white;
      }

      .demo-tab.completed {
        background: #10B981;
        border-color: #10B981;
        color: white;
      }

      .phone-mockup {
        position: relative;
        width: 340px;
        background: #1a1a1a;
        border-radius: 44px;
        padding: 14px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }

      .phone-screen {
        position: relative;
        width: 100%;
        aspect-ratio: 9 / 19.5;
        background: white;
        border-radius: 28px;
        overflow: hidden;
      }

      .phone-screen iframe {
        width: 100%;
        height: 100%;
        border: none;
      }

      /* Speech bubble overlay - cartoonish floating bubble */
      .speech-bubble-overlay {
        position: absolute;
        bottom: 20%;
        right: 5%;
        z-index: 100;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease-out;
      }

      .speech-bubble-overlay.visible {
        opacity: 1;
        pointer-events: auto;
        cursor: pointer;
      }

      .speech-bubble {
        position: relative;
        background: white;
        /* Asymmetric border-radius for organic hand-drawn feel */
        border-radius: 24px 28px 8px 26px;
        padding: 14px 18px;
        min-width: 160px;
        max-width: 200px;
        /* Comic-style border */
        border: 2.5px solid #1f2937;
        /* Playful shadow offset */
        box-shadow: 4px 4px 0 #1f2937;
        transform: scale(0.8) rotate(-2deg);
        opacity: 0;
        animation: none;
      }

      .speech-bubble-overlay.visible .speech-bubble {
        animation: bubblePopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes bubblePopIn {
        0% { opacity: 0; transform: scale(0.6) rotate(-8deg); }
        60% { transform: scale(1.05) rotate(1deg); }
        100% { opacity: 1; transform: scale(1) rotate(-2deg); }
      }

      /* Bubble tail - curved comic style pointing to bottom-left */
      .bubble-tail {
        position: absolute;
        bottom: -18px;
        left: 25px;
        width: 20px;
        height: 20px;
        background: white;
        border-left: 2.5px solid #1f2937;
        border-bottom: 2.5px solid #1f2937;
        transform: rotate(-45deg) skewX(-10deg);
        transform-origin: top left;
      }

      /* Shadow for tail */
      .bubble-tail::after {
        content: '';
        position: absolute;
        width: 100%;
        height: 100%;
        background: #1f2937;
        left: 4px;
        top: 4px;
        z-index: -1;
        border-radius: 0 0 0 2px;
      }

      .bubble-content {
        text-align: left;
        margin-bottom: 10px;
      }

      .comment-heading {
        font-size: 15px;
        font-weight: 700;
        color: #1f2937;
        line-height: 1.2;
        margin-bottom: 4px;
      }

      .comment-text {
        font-size: 12px;
        font-weight: 500;
        color: #4b5563;
        line-height: 1.4;
      }

      .bubble-footer {
        display: flex;
        justify-content: flex-end;
      }

      /* Countdown ring - smaller for compact bubble */
      .countdown-ring {
        position: relative;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .countdown-ring svg {
        position: absolute;
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .countdown-bg {
        fill: none;
        stroke: #e5e7eb;
        stroke-width: 3;
      }

      .countdown-progress {
        fill: none;
        stroke: #3b82f6;
        stroke-width: 3;
        stroke-linecap: round;
        stroke-dasharray: 100.53;
        stroke-dashoffset: 100.53;
        transition: stroke-dashoffset 0.1s linear;
      }

      .speech-bubble-overlay.visible .countdown-progress {
        animation: countdownFill var(--countdown-duration, 5s) linear forwards;
      }

      @keyframes countdownFill {
        0% { stroke-dashoffset: 100.53; }
        100% { stroke-dashoffset: 0; }
      }

      .tap-hint {
        font-size: 9px;
        color: #6b7280;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        z-index: 1;
      }

      .comment-heading .cursor,
      .comment-text .cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: #3b82f6;
        margin-left: 2px;
        animation: cursor-blink 0.8s step-end infinite;
      }

      @keyframes cursor-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      .home-indicator {
        position: absolute;
        bottom: 8px;
        left: 50%;
        transform: translateX(-50%);
        width: 100px;
        height: 4px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 2px;
      }

      /* Phone wrapper for label positioning */
      .phone-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      /* User label below phone */
      .phone-label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: white;
        border-radius: 24px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        opacity: 0;
        transform: translateY(-10px);
        animation: labelFadeIn 0.3s ease-out forwards;
        animation-delay: 0.2s;
      }

      .phone-label-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 14px;
      }

      .phone-label-name {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
      }

      @keyframes labelFadeIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Second phone slide-in animation */
      .phone-wrapper.second-phone {
        animation: slideInFromRight 0.5s ease-out forwards;
      }

      .phone-wrapper.second-phone .phone-label {
        animation-delay: 0.4s;
      }

      @keyframes slideInFromRight {
        from {
          opacity: 0;
          transform: translateX(50px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* Transition for player frame when adding second phone */
      .player-frame.transitioning {
        transition: all 0.3s ease-out;
      }

      /* Second phone slide-out animation for removal */
      .phone-wrapper.second-phone.removing {
        animation: slideOutToRight 0.3s ease-out forwards;
      }

      @keyframes slideOutToRight {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(50px);
        }
      }

      /* Label fade-out animation */
      .phone-label.removing {
        animation: labelFadeOut 0.3s ease-out forwards;
      }

      @keyframes labelFadeOut {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(-10px);
        }
      }

      /* Pause button */
      .pause-button {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        background: rgba(0, 0, 0, 0.6);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 150;
        transition: all 0.2s ease;
        opacity: 0.6;
      }

      .pause-button:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.8);
        transform: scale(1.1);
      }

      .pause-button .play-icon {
        display: none;
      }

      .pause-button .pause-icon {
        display: block;
      }

      .pause-button.paused .play-icon {
        display: block;
      }

      .pause-button.paused .pause-icon {
        display: none;
      }

      .pause-button.paused {
        opacity: 1;
        background: rgba(0, 0, 0, 0.8);
      }

      /* Responsive scaling - use viewport-based sizing for dual phones */
      @media (max-width: 768px) {
        .player-frame {
          min-width: unset;
          width: 100%;
          padding: 20px;
          gap: 20px;
        }

        .player-frame.dual-phone {
          min-width: unset;
          gap: 16px;
          padding: 16px;
        }

        /* Single phone stays large on tablet */
        .phone-mockup {
          width: 300px;
        }

        /* Dual phone: each phone takes ~45% of container width minus gap */
        .player-frame.dual-phone .phone-mockup {
          width: calc(45vw - 20px);
          max-width: 240px;
          min-width: 140px;
        }
      }

      /* Narrow screens - tighter layout */
      @media (max-width: 550px) {
        .player-frame {
          padding: 12px;
          gap: 12px;
        }

        .player-frame.dual-phone {
          gap: 10px;
          padding: 8px;
        }

        /* Single phone: take most of screen width */
        .phone-mockup {
          width: min(280px, 85vw);
        }

        /* Dual phone: maximize available width */
        .player-frame.dual-phone .phone-mockup {
          width: calc(48vw - 12px);
          max-width: 200px;
          min-width: 120px;
        }
      }

      /* Very narrow devices (iPhone SE, small phones) */
      @media (max-width: 400px) {
        /* Single phone: nearly full width */
        .phone-mockup {
          width: min(260px, 90vw);
        }

        .player-frame.dual-phone {
          gap: 6px;
          padding: 4px;
        }

        .player-frame.dual-phone .phone-mockup {
          width: calc(49vw - 8px);
          max-width: 180px;
          min-width: 100px;
        }
      }
    `,document.head.appendChild(e)}setupMessageListener(){this.messageHandler=t=>{var n,a,i,s;const e=t.data,o=this.iframes.findIndex(r=>r.contentWindow===t.source);switch(e.type){case"demoReady":console.log("[DemoPlayer] Iframe ready:",o),o>=0&&(this.iframesReady[o]=!0);break;case"demoActionComplete":o===0&&typeof e.actionIndex=="number"&&(this.currentActionIndex=e.actionIndex);break;case"demoStepChanged":if(o===0){if(console.log("[DemoPlayer] Step changed:",e.step,"actionIndex:",e.actionIndex,e.heading,e.text),this.updateTabs(e.step),this.currentStep=e.step,typeof e.actionIndex=="number"&&(this.currentActionIndex=e.actionIndex),(n=this.onStepChange)==null||n.call(this,e.step),!this.snapshots.has(e.step)){const r=e.actionIndex??this.currentActionIndex;console.log(`[DemoPlayer] Requesting snapshot for step ${e.step}, actionIndex ${r}`),(i=(a=this.iframes[0])==null?void 0:a.contentWindow)==null||i.postMessage({type:"captureSnapshot",step:e.step,actionIndex:r},"*")}this.options.enableSync&&!this.options.dualPhone&&(e.step===4?this.addSecondPhone():e.step===0&&this.hasSecondPhone&&this.removeSecondPhone()),(e.heading||e.text)&&this.showComment(e.heading||"",e.text||"",e.duration||1500)}break;case"snapshotCaptured":console.log(`[DemoPlayer] Snapshot captured for step ${e.step}, actionIndex ${e.actionIndex}`),this.snapshots.set(e.step,{step:e.step,actionIndex:e.actionIndex,stateVector:e.stateVector});break;case"bobCommand":if(this.iframes.length>1&&((s=this.iframes[1])!=null&&s.contentWindow)){console.log("[DemoPlayer] Forwarding bobCommand to Bob:",e.command);const{type:r,...l}=e;this.iframes[1].contentWindow.postMessage({type:"demoCommand",...l},"*")}else console.warn("[DemoPlayer] No second iframe to forward bobCommand to");break}},window.addEventListener("message",this.messageHandler)}setupKeyboardListener(){this.keyboardHandler=t=>{t.code==="Space"&&!(t.target instanceof HTMLInputElement)&&!(t.target instanceof HTMLTextAreaElement)&&(t.preventDefault(),this.togglePause())},window.addEventListener("keydown",this.keyboardHandler)}allIframesReady(){return this.iframesReady.every(t=>t)}waitForReady(){return new Promise(t=>{if(this.allIframesReady()){t();return}const e=()=>{this.allIframesReady()?t():setTimeout(e,100)};this.iframes.forEach((o,n)=>{o.addEventListener("load",()=>{setTimeout(()=>{this.iframesReady[n]||(this.iframesReady[n]=!0),this.allIframesReady()&&t()},500)})}),e()})}sendCommand(t){this.iframes.forEach(e=>{e.contentWindow&&e.contentWindow.postMessage(t,"*")})}async showComment(t,e,o=5e3){if(!this.overlayContainer)return;this.commentDismissTimer&&(clearTimeout(this.commentDismissTimer),this.commentDismissTimer=null);const n=this.overlayContainer.querySelector(".comment-heading"),a=this.overlayContainer.querySelector(".comment-text"),i=this.overlayContainer.querySelector(".speech-bubble"),s=this.overlayContainer.querySelector(".countdown-progress");n.textContent=t,a.textContent=e,this.overlayContainer.style.setProperty("--countdown-duration",`${o}ms`),this.overlayContainer.classList.remove("visible"),i&&(i.style.animation="none",i.offsetHeight,i.style.animation=""),s&&(s.style.animation="none",s.getBoundingClientRect(),s.style.animation=""),this.iframes.forEach(r=>{var l;(l=r.contentWindow)==null||l.postMessage({type:"demoControl",command:"pause"},"*")}),this.overlayContainer.classList.add("visible"),this.commentDismissTimer=setTimeout(()=>{this.hideComment()},o)}hideComment(){this.overlayContainer&&(this.commentDismissTimer&&(clearTimeout(this.commentDismissTimer),this.commentDismissTimer=null),this.overlayContainer.classList.remove("visible"),this.pendingCommand?(console.log("[DemoPlayer] Executing pending command:",this.pendingCommand.command),this.sendCommand(this.pendingCommand),this.pendingCommand=null):this.iframes.forEach(t=>{var e;(e=t.contentWindow)==null||e.postMessage({type:"demoControl",command:"resume"},"*")}))}async typeText(t,e,o){t.innerHTML='<span class="cursor"></span>';for(let a=0;a<e.length;a++){const i=e[a],s=t.querySelector(".cursor");if(s){const r=document.createTextNode(i);t.insertBefore(r,s)}await this.delay(o)}const n=t.querySelector(".cursor");n&&n.remove()}delay(t){return new Promise(e=>setTimeout(e,t))}updateTabs(t){if(!this.tabsContainer)return;this.tabsContainer.querySelectorAll(".demo-tab").forEach((o,n)=>{o.classList.remove("active","completed"),n<t?o.classList.add("completed"):n===t&&o.classList.add("active")})}goToStep(t){const e=this.options.steps[t];if(!e)return;this.currentStep=t,this.updateTabs(t),this.options.enableSync&&!this.options.dualPhone&&(t<4&&this.hasSecondPhone?this.removeSecondPhone():t===4&&!this.hasSecondPhone&&this.addSecondPhone());const o=this.snapshots.get(t);o?(console.log(`[DemoPlayer] Restoring snapshot for step ${t}, resuming from action ${o.actionIndex}`),this.iframes.forEach(n=>{var a;(a=n.contentWindow)==null||a.postMessage({type:"restoreSnapshot",step:t,stateVector:o.stateVector},"*")}),this.pendingCommand={type:"demoControl",command:"resumeFromAction",actionIndex:o.actionIndex},this.showComment(e.heading,e.text)):(console.log(`[DemoPlayer] No snapshot for step ${t}, jumping to step`),this.pendingCommand={type:"demoControl",command:"goToStep",step:t},this.showComment(e.heading,e.text))}start(){this.isPlaying||(this.isPlaying=!0,console.log("[DemoPlayer] Starting playback"),this.sendCommand({type:"demoControl",command:"start"}))}stop(){this.isPlaying=!1,console.log("[DemoPlayer] Stopping playback"),this.sendCommand({type:"demoControl",command:"stop"})}pause(){var t;this.isPausedState||(this.isPausedState=!0,console.log("[DemoPlayer] Pausing playback"),(t=this.pauseButton)==null||t.classList.add("paused"),this.sendCommand({type:"demoControl",command:"pause"}))}resume(){var t;this.isPausedState&&(this.isPausedState=!1,console.log("[DemoPlayer] Resuming playback"),(t=this.pauseButton)==null||t.classList.remove("paused"),this.sendCommand({type:"demoControl",command:"resume"}))}togglePause(){this.isPausedState?this.resume():this.pause()}get isPaused(){return this.isPausedState}destroy(){console.log("[DemoPlayer] Destroying player, session:",this.sessionId),this.stop(),this.iframes.forEach(t=>{var e;try{(e=t.contentWindow)==null||e.postMessage({type:"demoCleanup"},"*")}catch{}}),this.messageHandler&&(window.removeEventListener("message",this.messageHandler),this.messageHandler=null),this.keyboardHandler&&(window.removeEventListener("keydown",this.keyboardHandler),this.keyboardHandler=null),this.iframes=[],this.iframesReady=[],this.container.innerHTML=""}addSecondPhone(){if(this.hasSecondPhone||!this.playerFrame){console.log("[DemoPlayer] Second phone already added or playerFrame not ready");return}console.log("[DemoPlayer] Adding second phone (Bob)"),this.hasSecondPhone=!0;const{editorUrl:t,demoScript:e}=this.options;this.playerFrame.classList.add("transitioning","dual-phone");const o=this.playerFrame.querySelector(".phone-wrapper");if(o&&!o.querySelector(".phone-label")){const d=document.createElement("div");d.className="phone-label",d.innerHTML=`
        <span class="phone-label-avatar" style="background-color: #3b82f6">A</span>
        <span class="phone-label-name">Alice</span>
      `,o.appendChild(d)}const n=document.createElement("div");n.className="phone-wrapper second-phone";const a=document.createElement("div");a.className="phone-mockup";const i=document.createElement("div");i.className="phone-screen";const s=document.createElement("iframe"),r=this.options.offlineMode?"&offline=true":"";s.src=`${t}?autoplay=true&remoteControl=true&demo=${e}&showToolbar=true&enableSync=true&demoUser=2&observeOnly=true${r}`,s.setAttribute("frameborder","0"),s.setAttribute("allowfullscreen","true");const l=document.createElement("div");l.className="home-indicator",i.appendChild(s),i.appendChild(l),a.appendChild(i),n.appendChild(a);const c=document.createElement("div");c.className="phone-label",c.innerHTML=`
      <span class="phone-label-avatar" style="background-color: #10b981">B</span>
      <span class="phone-label-name">Bob</span>
    `,n.appendChild(c),this.playerFrame.appendChild(n),this.iframes.push(s),this.iframesReady.push(!1),s.addEventListener("load",()=>{setTimeout(()=>{const d=this.iframes.indexOf(s);d>=0&&(this.iframesReady[d]=!0,console.log("[DemoPlayer] Second phone iframe ready"))},500)}),setTimeout(()=>{var d;(d=this.playerFrame)==null||d.classList.remove("transitioning")},500)}removeSecondPhone(){if(!this.hasSecondPhone||!this.playerFrame){console.log("[DemoPlayer] No second phone to remove");return}console.log("[DemoPlayer] Removing second phone (Bob)");const t=this.playerFrame.querySelector(".phone-wrapper.second-phone");if(t){const n=this.iframes[1];if(n!=null&&n.contentWindow)try{n.contentWindow.postMessage({type:"demoCleanup"},"*")}catch{}t.classList.add("removing"),setTimeout(()=>{var a;t.remove(),this.hasSecondPhone=!1,this.iframes.length>1&&(this.iframes.pop(),this.iframesReady.pop()),(a=this.playerFrame)==null||a.classList.remove("dual-phone")},300)}const e=this.playerFrame.querySelector(".phone-wrapper"),o=e==null?void 0:e.querySelector(".phone-label");o&&(o.classList.add("removing"),setTimeout(()=>o.remove(),300))}}const E=4,C=Math.random().toString(36).substring(2,10),k=`demo-maps-${C}`;console.log("[Landing] Session ID:",C,"Doc ID:",k);let u=null;u=new P({container:document.getElementById("maps-demo-container"),demoScript:"maps",editorUrl:`/doc/${k}`,sessionId:C,enableSync:!0,steps:[{label:"Writing",heading:"Writing",text:"Just type - like any other doc"},{label:"Location Tagging",heading:"Location Tagging",text:"Double-tap text to create geo-marks"},{label:"Fullscreen Map",heading:"Fullscreen Map",text:"Click any map to expand and explore"},{label:"Transport",heading:"Transport",text:"Add routes between locations"},{label:"Share",heading:"Share",text:"Invite friends to collaborate in real-time"},{label:"Video Call",heading:"Video Call",text:"Discuss your trip together"}],autoStart:!0,offlineMode:!0});u.onStepChange=x=>{console.log("[Landing] Step changed:",x),x===E&&setTimeout(()=>{u.addSecondPhone()},2500)};window.addEventListener("beforeunload",()=>{console.log("[Landing] Page unloading - destroying demo player"),u&&(u.destroy(),u=null)});
//# sourceMappingURL=landing-C9ak4iXO.js.map
