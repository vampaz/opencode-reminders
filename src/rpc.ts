import { Rpc } from '@opencode/plugin/rpc';

const emptyInput = { type: 'object', properties: {}, additionalProperties: false } as const;
const voidOutput = { type: 'null' } as const;

const promptSchema = {
  type: 'object',
  properties: {
    sessionID: { type: 'string' },
    text: { type: 'string' },
  },
  required: ['sessionID', 'text'],
  additionalProperties: false,
} as const;

const reminderSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    message: { type: 'string' },
    dueAt: { type: 'string' },
    createdAt: { type: 'string' },
    firedAt: { type: 'string' },
    deliveredAt: { type: 'string' },
    cancelledAt: { type: 'string' },
    prompt: promptSchema,
  },
  required: ['id', 'title', 'dueAt', 'createdAt'],
  additionalProperties: false,
} as const;

const listSchema = { type: 'array', items: reminderSchema } as const;

const idInput = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
  additionalProperties: false,
} as const;

const createInput = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    when: { type: 'string' },
    message: { type: 'string' },
    prompt: promptSchema,
  },
  required: ['title', 'when'],
  additionalProperties: false,
} as const;

const settingsOutput = {
  type: 'object',
  properties: { fallback: { type: 'boolean' } },
  required: ['fallback'],
  additionalProperties: false,
} as const;

/** The contract between the server part and the desktop GUI. */
export const Reminders = Rpc.define({
  id: 'reminders',
  methods: {
    list: { input: emptyInput, output: listSchema },
    pending: { input: emptyInput, output: listSchema },
    create: {
      input: createInput,
      output: reminderSchema,
      errors: {
        invalid_when: { type: 'object', additionalProperties: false },
        empty_title: { type: 'object', additionalProperties: false },
      },
    },
    cancel: { input: idInput, output: voidOutput },
    remove: { input: idInput, output: voidOutput },
    ack: { input: idInput, output: voidOutput },
    settings: { input: emptyInput, output: settingsOutput },
    configure: {
      input: {
        type: 'object',
        properties: { fallback: { type: 'boolean' } },
        required: ['fallback'],
        additionalProperties: false,
      },
      output: voidOutput,
    },
  },
  events: {
    fired: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id', 'title'],
        additionalProperties: false,
      },
    },
  },
});
