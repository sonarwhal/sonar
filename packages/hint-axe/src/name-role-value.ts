// autogenerated by scripts/create/create-hints.js
import { HintContext } from 'hint/dist/src/lib/hint-context';
import { IHint } from 'hint/dist/src/lib/types';
import { register } from './util/axe';

import meta from './meta/name-role-value';

export default class AxeHint implements IHint {
    public static readonly meta = meta;
    public constructor(context: HintContext) {
        register(context, ['aria-hidden-focus', 'button-name', 'empty-heading', 'input-button-name', 'link-name'], ['empty-heading']);
    }
}
