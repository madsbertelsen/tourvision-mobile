import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { insertDestination } from './insert-destination-command';
import { countDestinations } from './count-destinations';

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: new PluginKey('slashCommands'),
        editor: this.editor,
        char: '/',
        
        items: ({ query }: { query: string }) => {
          return [
            {
              title: 'Destination',
              description: 'Add a new destination',
              command: ({ editor, range }: any) => {
                // Delete the slash
                editor.chain().focus().deleteRange(range).run();
                
                // Count existing destinations
                const doc = editor.getJSON();
                const colorIndex = countDestinations(doc);

                // Insert destination
                insertDestination(editor, {
                  name: 'New Destination',
                  context: '',
                  description: '',
                  colorIndex,
                  open: true,
                });
              },
            },
            {
              title: 'Heading 2',
              description: 'Add a section heading',
              command: ({ editor, range }: any) => {
                editor
                  .chain()
                  .focus()
                  .deleteRange(range)
                  .setNode('heading', { level: 2 })
                  .run();
              },
            },
            {
              title: 'Bullet List',
              description: 'Create a bullet list',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
              },
            },
          ].filter(item => 
            item.title.toLowerCase().includes(query.toLowerCase())
          );
        },

        render: () => {
          let component: any;
          let popup: any;

          return {
            onStart: (props: any) => {
              if (!props.clientRect) {
                return;
              }

              component = document.createElement('div');
              component.className = 'slash-commands-dropdown';
              
              const updateComponent = () => {
                component.innerHTML = '';
                
                const wrapper = document.createElement('div');
                wrapper.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 min-w-[200px]';
                
                props.items.forEach((item: any, index: number) => {
                  const button = document.createElement('button');
                  button.className = `w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    index === 0 ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`;
                  button.innerHTML = `
                    <div class="font-medium text-sm text-gray-900 dark:text-gray-100">${item.title}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${item.description}</div>
                  `;
                  button.onclick = () => item.command(props);
                  wrapper.appendChild(button);
                });
                
                component.appendChild(wrapper);
              };

              updateComponent();

              // Create tippy popup
              const { clientRect } = props;
              
              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.style.left = `${clientRect().left}px`;
              popup.style.top = `${clientRect().bottom + 5}px`;
              popup.style.zIndex = '1000';
              popup.appendChild(component);
              
              document.body.appendChild(popup);
            },

            onUpdate(props: any) {
              if (!component || !popup) {
                return;
              }

              const updateComponent = () => {
                component.innerHTML = '';
                
                const wrapper = document.createElement('div');
                wrapper.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 min-w-[200px]';
                
                props.items.forEach((item: any, index: number) => {
                  const button = document.createElement('button');
                  button.className = `w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    index === 0 ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`;
                  button.innerHTML = `
                    <div class="font-medium text-sm text-gray-900 dark:text-gray-100">${item.title}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${item.description}</div>
                  `;
                  button.onclick = () => item.command(props);
                  wrapper.appendChild(button);
                });
                
                component.appendChild(wrapper);
              };

              updateComponent();

              if (props.clientRect) {
                const { clientRect } = props;
                popup.style.left = `${clientRect().left}px`;
                popup.style.top = `${clientRect().bottom + 5}px`;
              }
            },

            onKeyDown(props: any) {
              if (props.event.key === 'Escape') {
                return true;
              }

              if (props.event.key === 'Enter') {
                if (props.items.length > 0) {
                  props.items[0].command(props);
                }
                return true;
              }

              return false;
            },

            onExit() {
              if (popup) {
                popup.remove();
              }
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});