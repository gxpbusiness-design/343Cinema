/* ═══════════════════════════════════════════════════════════════
   343CINEMA — SUITE PROTOCOL  v1.0
   Include this in wrotenote.html, mediumshot.html, 80ad.html

   Each app:
   1. Calls suite.init() on load
   2. Calls suite.handoffReady(data, target, label) when export is ready
   3. Listens to suite.onProjectChange(fn) for project switches
   4. Calls suite.receiveHandoff() to process incoming data
═══════════════════════════════════════════════════════════════ */

(function(global) {
  'use strict';

  const SUITE_HANDOFF_KEY  = 'suite_handoff';
  const SUITE_PROJECTS_KEY = 'suite_projects';
  const CHANNEL_NAME       = '343cinema';

  let _bc = null;
  try { _bc = new BroadcastChannel(CHANNEL_NAME); } catch(e) {}

  let _projectChangeListeners = [];
  let _handoffListeners = [];
  let _currentProject = null;

  // ── Listen for messages from parent shell ──
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    const d = e.data;

    if (d.type === 'suite_project') {
      _currentProject = d.project;
      _projectChangeListeners.forEach(fn => fn(d.project));
    }

    if (d.type === 'suite_receive_handoff') {
      _handoffListeners.forEach(fn => fn(d.handoff, d.project));
    }

    if (d.type === 'suite_theme') {
      applyTheme(d.theme);
    }
  });

  // ── BroadcastChannel listener ──
  if (_bc) {
    _bc.onmessage = function(e) {
      const d = e.data;
      if (d.type === 'suite_project') {
        _currentProject = d.project;
        _projectChangeListeners.forEach(fn => fn(d.project));
      }
    };
  }

  // ── Theme sync ──
  function applyTheme(theme) {
    // Each app handles its own theme — this is a hint
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle('dark', theme === 'dark');
    if (typeof setTheme === 'function') { try { setTheme(theme); } catch(e) {} }
    if (typeof msApplyDark === 'function') { try { msApplyDark(theme === 'dark'); } catch(e) {} }
    localStorage.setItem('suite_theme', theme);
  }

  // ── Public API ──
  global.suite = {

    // Call on app load to register with the shell
    init: function(appId) {
      this.appId = appId;
      // Check if running inside 343Cinema shell
      this.inShell = (window.parent !== window);
      // Load last project from localStorage
      try {
        const state = JSON.parse(localStorage.getItem('suite_343cinema') || '{}');
        _currentProject = state.project || null;
      } catch(e) {}
      // Apply stored theme
      const t = localStorage.getItem('suite_theme');
      if (t) applyTheme(t);
    },

    // Get the active project (shared across all apps)
    getProject: function() {
      return _currentProject;
    },

    // Get all projects
    getProjects: function() {
      try { return JSON.parse(localStorage.getItem(SUITE_PROJECTS_KEY) || '[]'); }
      catch(e) { return []; }
    },

    // Signal that data is ready to hand off to another app
    // target: 'prep' | 'produce'
    // data: the handoff payload
    // label: human-readable summary e.g. "12 scenes, 34 shots"
    handoffReady: function(data, target, label) {
      localStorage.setItem(SUITE_HANDOFF_KEY, JSON.stringify(data));
      const msg = { type: 'suite_handoff_ready', from: this.appId, to: target, label: label };
      if (this.inShell) {
        window.parent.postMessage(msg, '*');
      } else if (_bc) {
        _bc.postMessage(msg);
      }
    },

    // Get the current handoff payload (called by receiving app)
    getHandoff: function() {
      try { return JSON.parse(localStorage.getItem(SUITE_HANDOFF_KEY) || 'null'); }
      catch(e) { return null; }
    },

    // Register a handler for when the active project changes
    onProjectChange: function(fn) {
      _projectChangeListeners.push(fn);
    },

    // Register a handler for incoming handoff data
    onHandoff: function(fn) {
      _handoffListeners.push(fn);
    },

    // Notify the shell that a workflow step is complete
    stepComplete: function(step) {
      const msg = { type: 'suite_step_complete', step: step };
      if (this.inShell) window.parent.postMessage(msg, '*');
      if (_bc) _bc.postMessage(msg);
    },

    // Show a toast in the shell
    toast: function(msg) {
      if (this.inShell) window.parent.postMessage({ type:'suite_toast', msg }, '*');
    },

    // ── WroteNote → build handoff payload ──
    // Call this from WroteNote's export handler
    buildFromWroteNote: function(state) {
      const scenes = (state.scenes || []).map((sc, i) => {
        // Parse heading: "INT. COFFEE SHOP - DAY" → parts
        const h = sc.heading || '';
        const intExt = h.match(/^(INT\.|EXT\.|INT\/EXT\.)/i)?.[1]?.replace('.','') || '';
        const dashParts = h.replace(/^(INT\.|EXT\.|INT\/EXT\.)\s*/i, '').split(/\s*[-—]\s*/);
        const locName = dashParts[0] || '';
        const tod = dashParts[1] || '';

        // Characters in this scene
        const chars = [];
        (sc.blocks || []).forEach(b => {
          if (b.t === 'char' && b.name && !chars.includes(b.name)) chars.push(b.name);
        });

        // Annotations for this scene
        const sceneAnnots = (state.annotations || []).filter(a => a.sceneIdx === i);
        const props = sceneAnnots.filter(a=>a.type==='prop').map(a=>a.content);
        const costumes = sceneAnnots.filter(a=>a.type==='costume').map(a=>({name:a.content,char:''}));
        const shots = sceneAnnots.filter(a=>a.type==='shot').map(a=>a.shotData||{});
        const notes = sceneAnnots.filter(a=>a.type==='note').map(a=>a.content);

        return {
          num: String(i + 1),
          heading: h,
          int_ext: intExt,
          location: locName,
          time_of_day: tod,
          action: (sc.blocks||[]).filter(b=>b.t==='action').map(b=>b.text).join(' ').slice(0,300),
          characters: chars,
          props: props,
          costumes: costumes,
          shots: shots,
          notes: notes,
        };
      });

      // Global cast (all chars across entire script)
      const allChars = {};
      scenes.forEach(sc => sc.characters.forEach(c => {
        if (!allChars[c]) allChars[c] = [];
        allChars[c].push(sc.num);
      }));
      const allCast = Object.entries(allChars).map(([name, sceneNums]) => ({ name, scenes: sceneNums }));

      return {
        v: 1,
        source: 'wrotenote',
        project: _currentProject,
        timestamp: Date.now(),
        script: { title: state.title, format: 'Screenplay' },
        scenes: scenes,
        all_characters: Object.keys(allChars),
        all_locations: [...new Set(scenes.map(s=>s.location).filter(Boolean))],
        all_props: [...new Set(scenes.flatMap(s=>s.props))],
        all_costumes: [...new Set(scenes.flatMap(s=>s.costumes).map(c=>c.name))],
        all_shots: scenes.flatMap(s=>s.shots),
        cast: allCast,
      };
    },

    // ── Apply handoff to MediumShot ──
    applyToMediumShot: function(handoff) {
      if (!handoff || !handoff.scenes) return 0;
      const project = _currentProject;
      if (!project) return 0;

      // Build shot list from all shot annotations
      const shots = handoff.scenes.flatMap(sc =>
        sc.shots.map(s => ({
          scene: sc.num,
          heading: sc.heading,
          setup: s.setup || '',
          shot: s.shotNum || '',
          framing: s.frame || '',
          subject: s.subject || '',
          lens: s.lens || '',
          movement: s.movement || '',
          desc: s.notes || sc.action || '',
          status: 'ns',
          camera: '', angle: '', equipment: '', sound: '',
        }))
      );

      // Write into MediumShot's localStorage
      try {
        const ms = JSON.parse(localStorage.getItem('mediumshot') || '{}');
        if (!ms.projects) ms.projects = [];
        let pIdx = ms.projects.findIndex(p => p.id === project.id);
        if (pIdx < 0) {
          ms.projects.push({
            id: project.id, name: project.name, format: project.format,
            director: project.director, created: project.created,
            shotlists: [], scripts: [], moods: [],
          });
          pIdx = ms.projects.length - 1;
        }
        const p = ms.projects[pIdx];
        if (!p.shotlists) p.shotlists = [];
        // Add new shotlist
        p.shotlists.push({
          id: Date.now(),
          name: (handoff.script?.title || 'Script') + ' — Shot List',
          created: Date.now(),
          shots: shots,
        });
        // Store script reference
        if (!p.scripts) p.scripts = [];
        p.scripts.push({
          id: 'ms_'+Date.now(),
          title: handoff.script?.title || 'Script',
          scenes: handoff.scenes.length,
          importedAt: Date.now(),
        });
        ms.activeProject = pIdx;
        localStorage.setItem('mediumshot', JSON.stringify(ms));
      } catch(e) { console.error('suite.applyToMediumShot', e); }

      return shots.length;
    },

    // ── Apply handoff to 80AD ──
    applyTo80AD: function(handoff) {
      if (!handoff || !handoff.scenes) return { scenes:0, props:0, chars:0 };
      const project = _currentProject;
      if (!project) return { scenes:0, props:0, chars:0 };
      const prodId = project.id;

      let scenesAdded = 0, propsAdded = 0, charsAdded = 0;

      try {
        // 1. Ensure production exists
        const adProds = JSON.parse(localStorage.getItem('ad_productions') || '[]');
        if (!adProds.find(p=>p.id===prodId)) {
          adProds.push({ id:prodId, title:project.name, type:project.format||'Feature Film', color:'#F5A67D' });
          localStorage.setItem('ad_productions', JSON.stringify(adProds));
        }
        localStorage.setItem('ad_active_prod', prodId);

        // 2. Shooting schedule → ssfs_[prodId]
        const ssKey = 'ssfs_' + prodId;
        const existing = JSON.parse(localStorage.getItem(ssKey) || '[]');
        const schedKey = 'ss_' + prodId;
        const schedData = JSON.parse(localStorage.getItem(schedKey) || '{"rows":[],"info":{}}');
        if (!schedData.rows) schedData.rows = [];

        handoff.scenes.forEach(sc => {
          schedData.rows.push({
            type: 'shoot',
            time: '',
            dur: '',
            scene: sc.num,
            shotType: '',
            ptime: '',
            bdtime: '',
            takes: '',
            desc: sc.heading,
            actors: sc.characters.join(', '),
            props: sc.props.join(', '),
          });
          scenesAdded++;
        });
        localStorage.setItem(schedKey, JSON.stringify(schedData));

        // 3. Props & Costumes → costume_[prodId]
        const cosKey = 'costume_' + prodId;
        const cosData = JSON.parse(localStorage.getItem(cosKey) || '{"costumes":[],"props":[],"continuity":[]}');

        handoff.all_props.forEach(name => {
          if (!cosData.props.find(p=>p.name===name)) {
            cosData.props.push({ id:'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), name, char:'', status:'Ready', tags:'', notes:'' });
            propsAdded++;
          }
        });
        handoff.all_costumes.forEach(name => {
          if (!cosData.costumes.find(c=>c.name===name)) {
            // Try to link costume to character
            const matchScene = handoff.scenes.find(sc => sc.costumes.find(c=>c.name===name));
            const char = matchScene?.costumes.find(c=>c.name===name)?.char || '';
            cosData.costumes.push({ id:'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), name, char, status:'Ready', tags:'', notes:'' });
          }
        });
        localStorage.setItem(cosKey, JSON.stringify(cosData));

        // 4. Budget — add $0 line items for each prop (dept: Props)
        const budKey = 'budget_' + prodId;
        const budData = JSON.parse(localStorage.getItem(budKey) || '{"total":0,"expenses":[]}');
        handoff.all_props.forEach(name => {
          if (!budData.expenses.find(e=>e.desc===name)) {
            budData.expenses.push({ id:'b_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), desc:name, dept:'Props', amount:'0', date:'', notes:'From script breakdown' });
          }
        });
        localStorage.setItem(budKey, JSON.stringify(budData));

        // 5. Cast → contacts_global
        const contacts = JSON.parse(localStorage.getItem('contacts_global') || '[]');
        handoff.cast.forEach(c => {
          if (!contacts.find(x=>x.name.toLowerCase()===c.name.toLowerCase())) {
            contacts.push({ id:'con_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), name:c.name, role:'Actor', dept:'Cast', phone:'', email:'', notes:'Scenes: '+c.scenes.join(', ') });
            charsAdded++;
          }
        });
        localStorage.setItem('contacts_global', JSON.stringify(contacts));

      } catch(e) { console.error('suite.applyTo80AD', e); }

      return { scenes: scenesAdded, props: propsAdded, chars: charsAdded };
    },

    // ── Apply MediumShot shotlist to 80AD schedule ──
    applyMediumShotTo80AD: function(shotlist) {
      if (!shotlist || !shotlist.shots) return 0;
      const project = _currentProject;
      if (!project) return 0;
      const prodId = project.id;

      let added = 0;
      try {
        const schedKey = 'ss_' + prodId;
        const schedData = JSON.parse(localStorage.getItem(schedKey) || '{"rows":[],"info":{}}');
        if (!schedData.rows) schedData.rows = [];

        // Group shots by scene
        const byScene = {};
        (shotlist.shots || []).forEach(s => {
          const k = s.scene || 'Unassigned';
          if (!byScene[k]) byScene[k] = [];
          byScene[k].push(s);
        });

        Object.entries(byScene).forEach(([sceneNum, shots]) => {
          const first = shots[0];
          schedData.rows.push({
            type: 'shoot',
            time: '',
            dur: '',
            scene: sceneNum,
            shotType: shots.map(s=>s.framing||s.shot).filter(Boolean).join(', '),
            ptime: '',
            bdtime: '',
            takes: String(shots.length),
            desc: first.heading || ('Scene ' + sceneNum),
            actors: first.subject || '',
            props: '',
          });
          added++;
        });

        localStorage.setItem(schedKey, JSON.stringify(schedData));
      } catch(e) { console.error('suite.applyMediumShotTo80AD', e); }

      return added;
    },
  };

})(window);
