'use dom';

import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface LocationAttributes {
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  placeId?: string | null;
  address?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    locationMark: {
      setLocation: (attributes: LocationAttributes) => ReturnType;
      toggleLocation: (attributes: LocationAttributes) => ReturnType;
      unsetLocation: () => ReturnType;
    };
  }
}

export const LocationMark = Mark.create({
  name: 'location',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      latitude: {
        default: null,
        parseHTML: element => {
          const value = element.getAttribute('data-latitude');
          return value ? parseFloat(value) : null;
        },
        renderHTML: attributes => {
          if (!attributes.latitude) return {};
          return { 'data-latitude': attributes.latitude };
        },
      },
      longitude: {
        default: null,
        parseHTML: element => {
          const value = element.getAttribute('data-longitude');
          return value ? parseFloat(value) : null;
        },
        renderHTML: attributes => {
          if (!attributes.longitude) return {};
          return { 'data-longitude': attributes.longitude };
        },
      },
      placeName: {
        default: null,
        parseHTML: element => element.getAttribute('data-place-name'),
        renderHTML: attributes => {
          if (!attributes.placeName) return {};
          return { 'data-place-name': attributes.placeName };
        },
      },
      placeId: {
        default: null,
        parseHTML: element => element.getAttribute('data-place-id'),
        renderHTML: attributes => {
          if (!attributes.placeId) return {};
          return { 'data-place-id': attributes.placeId };
        },
      },
      address: {
        default: null,
        parseHTML: element => element.getAttribute('data-address'),
        renderHTML: attributes => {
          if (!attributes.address) return {};
          return { 'data-address': attributes.address };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-location]',
      },
      {
        tag: 'span[data-latitude]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-location': 'true',
        class: 'location-mark',
        style: 'border-bottom: 2px solid #3B82F6; cursor: pointer; position: relative;',
        title: HTMLAttributes.placeName
          ? `📍 ${HTMLAttributes.placeName}${HTMLAttributes.address ? ` - ${HTMLAttributes.address}` : ''}`
          : undefined,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setLocation:
        (attributes: LocationAttributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleLocation:
        (attributes: LocationAttributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetLocation:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('locationTooltip');

    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            const { doc, selection } = state;

            // Only show tooltip on hover, not during selection
            if (selection.from !== selection.to) {
              return DecorationSet.empty;
            }

            return DecorationSet.empty;
          },

          handleClick: (view, pos, event) => {
            const { state } = view;
            const $pos = state.doc.resolve(pos);
            const marks = $pos.marks();

            const locationMark = marks.find(mark => mark.type.name === 'location');

            if (locationMark && locationMark.attrs.latitude && locationMark.attrs.longitude) {
              // Open in maps when clicking on a location mark
              const { latitude, longitude, placeName } = locationMark.attrs;
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

              if (event.metaKey || event.ctrlKey) {
                window.open(mapsUrl, '_blank');
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});