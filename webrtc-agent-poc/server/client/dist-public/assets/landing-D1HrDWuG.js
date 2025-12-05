import{i as L}from"./AutoplayDemo-DI1okGHK.js";class A{constructor(e){this.iframes=[],this.tabsContainer=null,this.overlayContainer=null,this.phoneScreen=null,this.commentDismissTimer=null,this.playerFrame=null,this.hasSecondPhone=!1,this.messageHandler=null,this.currentStep=0,this.isPlaying=!1,this.isPausedState=!1,this.iframesReady=[],this.iframeAcknowledgedStart=!1,this.keyboardHandler=null,this.pauseButton=null,this.videoCallOverlay=null,this.stepModeNextButton=null,this.actionListContainer=null,this.demoActions=[],this.snapshots=new Map,this.currentActionIndex=0,this.pendingCommand=null,this.options=e,this.container=e.container,this.sessionId=e.sessionId||Math.random().toString(36).substring(2,10),console.log("[DemoPlayer] Session ID:",this.sessionId),this.createDOM(),this.setupMessageListener(),this.setupKeyboardListener();const t=this.parseUrlHash();t!==null&&(console.log("[DemoPlayer] Starting from URL hash action:",t),this.currentActionIndex=t),e.autoStart!==!1&&this.waitForReady().then(()=>{t!==null?this.startFromAction(t):this.start()})}parseUrlHash(){const e=window.location.hash;if(!e)return null;const t=e.match(/action=(\d+)/);if(t){const o=parseInt(t[1],10);if(!isNaN(o)&&o>=0)return o}return null}updateUrlHash(e){if(!this.options.stepMode)return;const t=`#action=${e}`,o=new URL(window.location.href);o.hash=t,window.history.replaceState(null,"",o.toString())}createDOM(){const{steps:e,editorUrl:t,demoScript:o,dualPhone:n,enableSync:a,offlineMode:s}=this.options,i=n?2:1,r=s?"&offline=true":"",l=document.createElement("div");l.className="demo-player",this.tabsContainer=document.createElement("div"),this.tabsContainer.className="demo-tabs",e.forEach((p,m)=>{const h=document.createElement("button");h.className="demo-tab"+(m===0?" active":""),h.textContent=p.label,h.dataset.step=String(m),h.addEventListener("click",()=>this.goToStep(m)),this.tabsContainer.appendChild(h)});const d=document.createElement("div");d.className="player-frame"+(n?" dual-phone":""),this.playerFrame=d;const c=[{name:"Alice",color:"#3b82f6"},{name:"Bob",color:"#10b981"}];let u=null;for(let p=0;p<i;p++){const m=document.createElement("div");m.className="phone-wrapper";const h=document.createElement("div");h.className="phone-mockup";const b=document.createElement("div");b.className="phone-screen",p===0&&(u=b);const g=document.createElement("iframe");let w="";if(n){const y=p===1;w=`&enableSync=true&demoUser=${p+1}${y?"&observeOnly=true":""}`}else a&&(w="&enableSync=true&demoUser=1");g.src=`${t}?autoplay=true&remoteControl=true&demo=${o}&showToolbar=true${w}${r}`,g.setAttribute("frameborder","0"),g.setAttribute("allowfullscreen","true");const k=document.createElement("div");if(k.className="home-indicator",b.appendChild(g),b.appendChild(k),h.appendChild(b),m.appendChild(h),n||a){const y=c[p],v=document.createElement("div");v.className="phone-label",v.innerHTML=`
          <span class="phone-label-avatar" style="background-color: ${y.color}">${y.name[0]}</span>
          <span class="phone-label-name">${y.name}</span>
        `,m.appendChild(v)}d.appendChild(m),this.iframes.push(g),this.iframesReady.push(!1),p===0&&(this.phoneScreen=b)}this.overlayContainer=document.createElement("div"),this.overlayContainer.className="speech-bubble-overlay",this.overlayContainer.innerHTML=`
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
    `,this.pauseButton.addEventListener("click",()=>{this.togglePause()}),this.options.stepMode&&(this.stepModeNextButton=document.createElement("button"),this.stepModeNextButton.className="step-mode-next-button",this.stepModeNextButton.innerHTML=`
        <span class="step-next-icon">→</span>
        <span class="step-next-text">Next Action</span>
        <span class="step-next-index">#${this.currentActionIndex}</span>
      `,this.stepModeNextButton.addEventListener("click",()=>{if(!this.iframeAcknowledgedStart&&this.currentActionIndex>0){console.log("[DemoPlayer] Iframe not yet acknowledged, re-sending startFromAction:",this.currentActionIndex),this.sendCommand({type:"demoControl",command:"setStepMode",enabled:!0}),this.sendCommand({type:"demoControl",command:"startFromAction",actionIndex:this.currentActionIndex});return}this.sendCommand({type:"demoControl",command:"nextAction"})})),this.videoCallOverlay=document.createElement("div"),this.videoCallOverlay.className="demo-video-call-overlay",this.videoCallOverlay.innerHTML=`
      <div class="video-call-container">
        <div class="video-thumbnail bob">
          <div class="video-avatar-circle">B</div>
          <span class="video-name">Bob</span>
        </div>
        <div class="video-thumbnail self">
          <div class="video-avatar-circle self">A</div>
        </div>
      </div>
    `,u&&u.appendChild(this.videoCallOverlay);const f=document.createElement("div");f.className="player-content",f.appendChild(d),f.appendChild(this.pauseButton),f.appendChild(this.overlayContainer),this.stepModeNextButton&&f.appendChild(this.stepModeNextButton),this.options.stepMode&&this.createActionList(o),l.appendChild(this.tabsContainer),l.appendChild(f),this.actionListContainer&&l.appendChild(this.actionListContainer),this.injectStyles(),this.container.appendChild(l)}injectStyles(){const e="demo-player-styles";if(document.getElementById(e))return;const t=document.createElement("style");t.id=e,t.textContent=`
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

      /* Step mode - hide countdown animation, show button style */
      .countdown-ring.step-mode svg {
        display: none;
      }

      .countdown-ring.step-mode {
        background: #3b82f6;
        border-radius: 6px;
        width: auto;
        height: auto;
        padding: 6px 12px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .countdown-ring.step-mode:hover {
        background: #2563eb;
      }

      .countdown-ring.step-mode .tap-hint {
        color: white;
        font-size: 11px;
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

      /* Step mode Next button - large, prominent button */
      .step-mode-next-button {
        position: absolute;
        bottom: 20px;
        right: 100px;
        padding: 16px 32px;
        font-size: 18px;
        font-weight: 600;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        z-index: 200;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        transition: all 0.2s ease;
      }

      .step-mode-next-button:hover {
        background: #2563eb;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
      }

      .step-mode-next-button:active {
        transform: translateY(0);
      }

      .step-next-icon {
        font-size: 24px;
      }

      .step-next-text {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .step-next-index {
        background: rgba(255, 255, 255, 0.2);
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 14px;
        font-family: monospace;
      }

      .step-mode-next-button:disabled {
        background: #22c55e;
        cursor: default;
      }

      .step-mode-next-button:disabled:hover {
        background: #22c55e;
        transform: none;
        box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
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

      /* Video call overlay - FaceTime-style floating thumbnails inside phone */
      .demo-video-call-overlay {
        position: absolute;
        top: 50px;
        right: 8px;
        z-index: 200;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .demo-video-call-overlay.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .video-call-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
      }

      .video-thumbnail {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 0, 0, 0.6);
        padding: 6px 10px 6px 6px;
        border-radius: 20px;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .video-thumbnail.self {
        background: rgba(0, 0, 0, 0.4);
        padding: 4px;
        border-radius: 12px;
      }

      .video-avatar-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #10b981;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
      }

      .video-avatar-circle.self {
        width: 40px;
        height: 40px;
        font-size: 16px;
        background: #3b82f6;
        border: 2px solid rgba(255, 255, 255, 0.5);
      }

      .video-name {
        font-size: 12px;
        font-weight: 500;
        color: white;
      }

      /* Pop-in animation for video call */
      .demo-video-call-overlay.visible .video-thumbnail {
        animation: thumbnailPopIn 0.3s ease-out forwards;
        opacity: 0;
      }

      .demo-video-call-overlay.visible .video-thumbnail.self {
        animation-delay: 0.15s;
      }

      @keyframes thumbnailPopIn {
        0% {
          opacity: 0;
          transform: scale(0.7) translateX(20px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateX(0);
        }
      }

      /* Action list panel */
      .action-list-container {
        width: 100%;
        max-width: 600px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        margin-top: 24px;
      }

      .action-list-header {
        font-size: 14px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e2e8f0;
      }

      .action-list {
        max-height: 400px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .action-list-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: white;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 13px;
      }

      .action-list-item:hover {
        border-color: #cbd5e1;
        background: #f1f5f9;
      }

      .action-list-item.active {
        background: #3b82f6;
        border-color: #3b82f6;
        color: white;
      }

      .action-list-item.active .action-index,
      .action-list-item.active .action-type,
      .action-list-item.active .action-detail {
        color: white;
      }

      .action-list-item.completed {
        background: #f0fdf4;
        border-color: #bbf7d0;
      }

      .action-list-item.completed .action-index {
        color: #16a34a;
      }

      .action-index {
        font-family: monospace;
        font-size: 11px;
        color: #94a3b8;
        min-width: 28px;
      }

      .action-type {
        font-weight: 600;
        color: #334155;
        min-width: 140px;
      }

      .action-detail {
        color: #64748b;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,document.head.appendChild(t)}setupMessageListener(){this.messageHandler=e=>{var n,a,s,i;const t=e.data,o=this.iframes.findIndex(r=>r.contentWindow===e.source);switch(t.type){case"demoReady":console.log("[DemoPlayer] Iframe ready:",o),o>=0&&(this.iframesReady[o]=!0);break;case"demoActionComplete":if(o===0&&typeof t.actionIndex=="number"){this.currentActionIndex=t.actionIndex,this.iframeAcknowledgedStart=!0;const r=t.actionIndex+1;if(this.updateUrlHash(r),this.updateActionListHighlight(r),this.options.stepMode&&this.stepModeNextButton){const l=t.actionType||"unknown";t.isLastAction===!0?(this.stepModeNextButton.innerHTML=`
                  <span class="step-next-icon">✓</span>
                  <span class="step-next-text">Demo Complete</span>
                `,this.stepModeNextButton.disabled=!0):this.stepModeNextButton.innerHTML=`
                  <span class="step-next-icon">→</span>
                  <span class="step-next-text">Next Action</span>
                  <span class="step-next-index">#${r}</span>
                `,console.log(`[DemoPlayer] Step mode: action ${t.actionIndex} (${l}) complete, next: ${r}`)}}break;case"demoStepChanged":if(o===0){if(console.log("[DemoPlayer] Step changed:",t.step,"actionIndex:",t.actionIndex,t.heading,t.text),this.updateTabs(t.step),this.currentStep=t.step,typeof t.actionIndex=="number"&&(this.currentActionIndex=t.actionIndex),(n=this.onStepChange)==null||n.call(this,t.step),!this.snapshots.has(t.step)){const r=t.actionIndex??this.currentActionIndex;console.log(`[DemoPlayer] Requesting snapshot for step ${t.step}, actionIndex ${r}`),(s=(a=this.iframes[0])==null?void 0:a.contentWindow)==null||s.postMessage({type:"captureSnapshot",step:t.step,actionIndex:r},"*")}this.options.enableSync&&!this.options.dualPhone&&(t.step===4?this.addSecondPhone():t.step===0&&this.hasSecondPhone&&this.removeSecondPhone()),(t.heading||t.text)&&this.showComment(t.heading||"",t.text||"",t.duration||1500)}break;case"snapshotCaptured":console.log(`[DemoPlayer] Snapshot captured for step ${t.step}, actionIndex ${t.actionIndex}`),this.snapshots.set(t.step,{step:t.step,actionIndex:t.actionIndex,stateVector:t.stateVector});break;case"showVideoCall":console.log("[DemoPlayer] Showing video call overlay"),this.showVideoCallOverlay();break;case"hideVideoCall":console.log("[DemoPlayer] Hiding video call overlay"),this.hideVideoCallOverlay();break;case"bobCommand":if(this.iframes.length>1&&((i=this.iframes[1])!=null&&i.contentWindow)){console.log("[DemoPlayer] Forwarding bobCommand to Bob:",t.command);const{type:r,...l}=t;this.iframes[1].contentWindow.postMessage({type:"demoCommand",...l},"*")}else console.warn("[DemoPlayer] No second iframe to forward bobCommand to");break}},window.addEventListener("message",this.messageHandler)}setupKeyboardListener(){this.keyboardHandler=e=>{e.code==="Space"&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)&&(e.preventDefault(),this.togglePause())},window.addEventListener("keydown",this.keyboardHandler)}allIframesReady(){return this.iframesReady.every(e=>e)}waitForReady(){return new Promise(e=>{if(this.allIframesReady()){e();return}const t=()=>{this.allIframesReady()?e():setTimeout(t,100)};this.iframes.forEach((o,n)=>{o.addEventListener("load",()=>{setTimeout(()=>{this.iframesReady[n]||(this.iframesReady[n]=!0),this.allIframesReady()&&e()},500)})}),t()})}sendCommand(e){this.iframes.forEach(t=>{t.contentWindow&&t.contentWindow.postMessage(e,"*")})}async showComment(e,t,o=5e3){if(!this.overlayContainer)return;this.commentDismissTimer&&(clearTimeout(this.commentDismissTimer),this.commentDismissTimer=null);const n=this.overlayContainer.querySelector(".comment-heading"),a=this.overlayContainer.querySelector(".comment-text"),s=this.overlayContainer.querySelector(".speech-bubble"),i=this.overlayContainer.querySelector(".countdown-progress"),r=this.overlayContainer.querySelector(".countdown-ring"),l=this.overlayContainer.querySelector(".tap-hint");n.textContent=e,a.textContent=t;const d=this.options.stepMode===!0;d?(r&&r.classList.add("step-mode"),l&&(l.textContent="Next")):(r&&r.classList.remove("step-mode"),l&&(l.textContent="Tap"),this.overlayContainer.style.setProperty("--countdown-duration",`${o}ms`)),this.overlayContainer.classList.remove("visible"),s&&(s.style.animation="none",s.offsetHeight,s.style.animation=""),i&&!d&&(i.style.animation="none",i.getBoundingClientRect(),i.style.animation=""),this.iframes.forEach(c=>{var u;(u=c.contentWindow)==null||u.postMessage({type:"demoControl",command:"pause"},"*")}),this.overlayContainer.classList.add("visible"),d||(this.commentDismissTimer=setTimeout(()=>{this.hideComment()},o))}hideComment(){this.overlayContainer&&(this.commentDismissTimer&&(clearTimeout(this.commentDismissTimer),this.commentDismissTimer=null),this.overlayContainer.classList.remove("visible"),this.pendingCommand?(console.log("[DemoPlayer] Executing pending command:",this.pendingCommand.command),this.sendCommand(this.pendingCommand),this.pendingCommand=null):this.iframes.forEach(e=>{var t;(t=e.contentWindow)==null||t.postMessage({type:"demoControl",command:"resume"},"*")}))}async typeText(e,t,o){e.innerHTML='<span class="cursor"></span>';for(let a=0;a<t.length;a++){const s=t[a],i=e.querySelector(".cursor");if(i){const r=document.createTextNode(s);e.insertBefore(r,i)}await this.delay(o)}const n=e.querySelector(".cursor");n&&n.remove()}delay(e){return new Promise(t=>setTimeout(t,e))}updateTabs(e){if(!this.tabsContainer)return;this.tabsContainer.querySelectorAll(".demo-tab").forEach((o,n)=>{o.classList.remove("active","completed"),n<e?o.classList.add("completed"):n===e&&o.classList.add("active")})}goToStep(e){const t=this.options.steps[e];if(!t)return;this.currentStep=e,this.updateTabs(e),this.options.enableSync&&!this.options.dualPhone&&(e<4&&this.hasSecondPhone?this.removeSecondPhone():e===4&&!this.hasSecondPhone&&this.addSecondPhone());const o=this.snapshots.get(e);o?(console.log(`[DemoPlayer] Restoring snapshot for step ${e}, resuming from action ${o.actionIndex}`),this.iframes.forEach(n=>{var a;(a=n.contentWindow)==null||a.postMessage({type:"restoreSnapshot",step:e,stateVector:o.stateVector},"*")}),this.pendingCommand={type:"demoControl",command:"resumeFromAction",actionIndex:o.actionIndex},this.showComment(t.heading,t.text)):(console.log(`[DemoPlayer] No snapshot for step ${e}, jumping to step`),this.pendingCommand={type:"demoControl",command:"goToStep",step:e},this.showComment(t.heading,t.text))}start(){this.isPlaying||(this.isPlaying=!0,this.iframeAcknowledgedStart=!1,console.log("[DemoPlayer] Starting playback"),this.options.stepMode&&this.sendCommand({type:"demoControl",command:"setStepMode",enabled:!0}),this.sendCommand({type:"demoControl",command:"start"}))}async startFromAction(e){this.isPlaying&&this.stop(),this.isPlaying=!0,this.iframeAcknowledgedStart=!1,console.log("[DemoPlayer] Starting from action:",e),this.updateUrlHash(e),this.options.stepMode&&this.sendCommand({type:"demoControl",command:"setStepMode",enabled:!0}),await this.fastForwardToAction(e),this.currentActionIndex=e,this.iframeAcknowledgedStart=!0,this.options.stepMode&&this.stepModeNextButton&&(this.stepModeNextButton.innerHTML=`
        <span class="step-next-icon">→</span>
        <span class="step-next-text">Next Action</span>
        <span class="step-next-index">#${e}</span>
      `),this.updateActionListHighlight(e),console.log("[DemoPlayer] Fast-forward complete, ready at action:",e)}async fastForwardToAction(e){const t=this.demoActions;if(t.length===0){console.warn("[DemoPlayer] No demo actions loaded, cannot fast-forward");return}let o=-1;for(let a=e;a>=0;a--)if(t[a].type==="setupChapterState"){o=a;break}console.log(`[DemoPlayer] Fast-forwarding: setupIndex=${o}, targetIndex=${e}`),o>=0&&(await this.executeActionAndWait(t[o],o,!0),await this.delay(200));const n=o>=0?o+1:0;for(let a=n;a<e;a++){const s=t[a];if(s.type==="pause"||s.type==="comment")continue;console.log(`[DemoPlayer] Fast-forward executing action ${a}: ${s.type}`),await this.executeActionAndWait(s,a,!0);const i=this.getFastForwardDelay(s);i>0&&await this.delay(i)}}getFastForwardDelay(e){switch(e.type){case"openFullscreenMap":return 800;case"clickMapMarker":return 1e3;case"showFingerTap":return 500;case"fingerTapRoute":return 300;case"addWaypoint":return 300;case"fingerDrag":return 200;default:return 100}}executeActionAndWait(e,t,o){return new Promise(n=>{const a=s=>{const i=s.data;(i==null?void 0:i.type)==="actionExecuted"&&i.actionIndex===t&&(window.removeEventListener("message",a),n())};window.addEventListener("message",a),this.sendCommand({type:"demoControl",command:"executeAction",action:e,actionIndex:t,fastForward:o}),setTimeout(()=>{window.removeEventListener("message",a),n()},3e3)})}stop(){this.isPlaying=!1,console.log("[DemoPlayer] Stopping playback"),this.sendCommand({type:"demoControl",command:"stop"})}pause(){var e;this.isPausedState||(this.isPausedState=!0,console.log("[DemoPlayer] Pausing playback"),(e=this.pauseButton)==null||e.classList.add("paused"),this.sendCommand({type:"demoControl",command:"pause"}))}resume(){var e;this.isPausedState&&(this.isPausedState=!1,console.log("[DemoPlayer] Resuming playback"),(e=this.pauseButton)==null||e.classList.remove("paused"),this.sendCommand({type:"demoControl",command:"resume"}))}togglePause(){this.isPausedState?this.resume():this.pause()}get isPaused(){return this.isPausedState}showVideoCallOverlay(){this.videoCallOverlay&&this.videoCallOverlay.classList.add("visible")}hideVideoCallOverlay(){this.videoCallOverlay&&this.videoCallOverlay.classList.remove("visible")}createActionList(e){const t=L[e];if(!t){console.warn(`[DemoPlayer] Demo script '${e}' not found`);return}this.demoActions=t.actions,this.actionListContainer=document.createElement("div"),this.actionListContainer.className="action-list-container";const o=document.createElement("div");o.className="action-list-header",o.textContent=`Actions (${this.demoActions.length})`,this.actionListContainer.appendChild(o);const n=document.createElement("div");n.className="action-list",this.demoActions.forEach((a,s)=>{const i=document.createElement("div");i.className="action-list-item",i.dataset.index=String(s);const r=this.formatActionDescription(a);i.innerHTML=`
        <span class="action-index">#${s}</span>
        <span class="action-type">${a.type}</span>
        <span class="action-detail">${r}</span>
      `,i.addEventListener("click",()=>{this.startFromAction(s)}),n.appendChild(i)}),this.actionListContainer.appendChild(n),this.updateActionListHighlight(this.currentActionIndex)}formatActionDescription(e){switch(e.type){case"pause":return`${e.duration}ms`;case"fingerDrag":return`${e.direction} ${e.distance}px`;case"clickMapMarker":return`marker #${e.markerIndex}`;case"showFingerTap":return e.selector||"";case"setupChapterState":return e.state;case"addWaypoint":return`${e.destGeoId}`;default:return""}}updateActionListHighlight(e){if(!this.actionListContainer)return;this.actionListContainer.querySelectorAll(".action-list-item").forEach((o,n)=>{o.classList.remove("active","completed"),n<e?o.classList.add("completed"):n===e&&(o.classList.add("active"),o.scrollIntoView({behavior:"smooth",block:"nearest"}))})}destroy(){console.log("[DemoPlayer] Destroying player, session:",this.sessionId),this.stop(),this.iframes.forEach(e=>{var t;try{(t=e.contentWindow)==null||t.postMessage({type:"demoCleanup"},"*")}catch{}}),this.messageHandler&&(window.removeEventListener("message",this.messageHandler),this.messageHandler=null),this.keyboardHandler&&(window.removeEventListener("keydown",this.keyboardHandler),this.keyboardHandler=null),this.iframes=[],this.iframesReady=[],this.container.innerHTML=""}addSecondPhone(){if(this.hasSecondPhone||!this.playerFrame){console.log("[DemoPlayer] Second phone already added or playerFrame not ready");return}console.log("[DemoPlayer] Adding second phone (Bob)"),this.hasSecondPhone=!0;const{editorUrl:e,demoScript:t}=this.options;this.playerFrame.classList.add("transitioning","dual-phone");const o=this.playerFrame.querySelector(".phone-wrapper");if(o&&!o.querySelector(".phone-label")){const c=document.createElement("div");c.className="phone-label",c.innerHTML=`
        <span class="phone-label-avatar" style="background-color: #3b82f6">A</span>
        <span class="phone-label-name">Alice</span>
      `,o.appendChild(c)}const n=document.createElement("div");n.className="phone-wrapper second-phone";const a=document.createElement("div");a.className="phone-mockup";const s=document.createElement("div");s.className="phone-screen";const i=document.createElement("iframe"),r=this.options.offlineMode?"&offline=true":"";i.src=`${e}?autoplay=true&remoteControl=true&demo=${t}&showToolbar=true&enableSync=true&demoUser=2&observeOnly=true${r}`,i.setAttribute("frameborder","0"),i.setAttribute("allowfullscreen","true");const l=document.createElement("div");l.className="home-indicator",s.appendChild(i),s.appendChild(l),a.appendChild(s),n.appendChild(a);const d=document.createElement("div");d.className="phone-label",d.innerHTML=`
      <span class="phone-label-avatar" style="background-color: #10b981">B</span>
      <span class="phone-label-name">Bob</span>
    `,n.appendChild(d),this.playerFrame.appendChild(n),this.iframes.push(i),this.iframesReady.push(!1),i.addEventListener("load",()=>{setTimeout(()=>{const c=this.iframes.indexOf(i);c>=0&&(this.iframesReady[c]=!0,console.log("[DemoPlayer] Second phone iframe ready"))},500)}),setTimeout(()=>{var c;(c=this.playerFrame)==null||c.classList.remove("transitioning")},500)}removeSecondPhone(){if(!this.hasSecondPhone||!this.playerFrame){console.log("[DemoPlayer] No second phone to remove");return}console.log("[DemoPlayer] Removing second phone (Bob)");const e=this.playerFrame.querySelector(".phone-wrapper.second-phone");if(e){const n=this.iframes[1];if(n!=null&&n.contentWindow)try{n.contentWindow.postMessage({type:"demoCleanup"},"*")}catch{}e.classList.add("removing"),setTimeout(()=>{var a;e.remove(),this.hasSecondPhone=!1,this.iframes.length>1&&(this.iframes.pop(),this.iframesReady.pop()),(a=this.playerFrame)==null||a.classList.remove("dual-phone")},300)}const t=this.playerFrame.querySelector(".phone-wrapper"),o=t==null?void 0:t.querySelector(".phone-label");o&&(o.classList.add("removing"),setTimeout(()=>o.remove(),300))}}const C=Math.random().toString(36).substring(2,10),S=`demo-collab-${C}`;console.log("[Landing Collab] Session ID:",C,"Doc ID:",S);const M=new URLSearchParams(window.location.search),P=M.get("stepMode")==="true";P&&console.log("[Landing Collab] Step mode enabled - click Next to advance");let x=null;x=new A({container:document.getElementById("collab-demo-container"),demoScript:"collabMap",editorUrl:`/doc/${S}`,sessionId:C,dualPhone:!0,steps:[{label:"Planning",heading:"Planning Together",text:"Alice and Bob explore locations on the same document"},{label:"Exploring",heading:"Exploring the Map",text:"Alice pans the map to see all locations"},{label:"Transport",heading:"Walking to Tivoli",text:"Alice configures walking directions to Tivoli Gardens"},{label:"Route",heading:"Route Configured",text:"The walking route is now visible on the map"}],autoStart:!0,offlineMode:!0,stepMode:P});window.addEventListener("beforeunload",()=>{console.log("[Landing Collab] Page unloading - destroying demo player"),x&&(x.destroy(),x=null)});
//# sourceMappingURL=landing-D1HrDWuG.js.map
