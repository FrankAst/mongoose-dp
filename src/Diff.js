// @flow
/* eslint-disable no-param-reassign */

import { realTypeOf, getOrderIndependentHash, revertArrayChange } from './utils';
import type { RawChangeT } from './definitions';

export type PrefilterT = (path: Array<string>, key: string) => boolean;

export type StackT = {|
  lhs: mixed,
  rhs: mixed,
|};

export type DeepDiffOptsT = {|
  prefilter: PrefilterT,
  orderIndependent: boolean,
  key?: string,
  path?: Array<string>,
  stack?: Array<StackT>,
|};

export const deepDiff = (
  lhs: any,
  rhs: any,
  changes: Array<RawChangeT> = [],
  opts: DeepDiffOptsT
): void => {
  const { path, prefilter, key, orderIndependent } = opts || {};
  let { stack } = opts || {};
  stack = stack || [];
  const currentPath = path ? [...path] : [];

  if (key) {
    if (prefilter && prefilter(currentPath, key)) return;
    currentPath.push(key);
  }

  if (realTypeOf(lhs) === 'regexp' && realTypeOf(rhs) === 'regexp') {
    lhs = lhs.toString();
    rhs = rhs.toString();
  }

  let i;
  let j;
  let other;

  const ldefined =
    !!lhs ||
    (stack &&
      stack.length > 0 &&
      stack[stack.length - 1].lhs &&
      Object.getOwnPropertyDescriptor(stack[stack.length - 1].lhs, key));

  const rdefined =
    !!rhs ||
    (stack &&
      stack.length > 0 &&
      stack[stack.length - 1].rhs &&
      Object.getOwnPropertyDescriptor(stack[stack.length - 1].rhs, key));

  if (!ldefined && rdefined) {
    changes.push({ k: 'N', p: currentPath, r: rhs });
  } else if (!rdefined && ldefined) {
    changes.push({ k: 'D', p: currentPath, l: lhs });
  } else if (realTypeOf(lhs) !== realTypeOf(rhs)) {
    changes.push({ k: 'E', p: currentPath, l: lhs, r: rhs });
  } else if (realTypeOf(lhs) === 'date' && lhs - rhs !== 0) {
    changes.push({ k: 'E', p: currentPath, l: lhs, r: rhs });
  } else if (lhs && rhs && typeof lhs === 'object') {
    for (i = stack.length - 1; i > -1; --i) {
      if (stack[i].lhs === lhs) {
        other = true;
        break;
      }
    }
    if (!other) {
      stack.push({ lhs, rhs });
      if (Array.isArray(lhs)) {
        // If order doesn't matter, we need to sort our arrays
        if (orderIndependent) {
          lhs.sort((a, b) => {
            return getOrderIndependentHash(a) - getOrderIndependentHash(b);
          });

          rhs.sort((a, b) => {
            return getOrderIndependentHash(a) - getOrderIndependentHash(b);
          });
        }
        i = rhs.length - 1;
        j = lhs.length - 1;

        while (i > j) {
          changes.push({
            k: 'A',
            p: currentPath,
            i,
            it: { k: 'N', r: rhs[i--] },
          });
        }

        while (j > i) {
          changes.push({
            k: 'A',
            p: currentPath,
            i: j,
            it: { k: 'D', l: lhs[j--] },
          });
        }

        while (i >= 0) {
          deepDiff(lhs[i], rhs[i], changes, {
            prefilter,
            path: currentPath,
            key: i.toString(),
            stack,
            orderIndependent,
          });
          --i;
        }
      } else {
        const lhsKeys = Object.keys(lhs);
        const rhsKeys = Object.keys(rhs);

        lhsKeys.forEach(lhsKey => {
          other = rhsKeys.indexOf(lhsKey);
          if (other >= 0) {
            deepDiff(lhs[lhsKey], rhs[lhsKey], changes, {
              prefilter,
              path: currentPath,
              key: lhsKey,
              stack,
              orderIndependent,
            });
            rhsKeys[other] = null;
          } else {
            deepDiff(lhs[lhsKey], null, changes, {
              prefilter,
              path: currentPath,
              key: lhsKey,
              stack,
              orderIndependent,
            });
          }
        });

        rhsKeys.forEach(rhsKey => {
          if (rhsKey) {
            deepDiff(null, rhs[rhsKey], changes, {
              prefilter,
              path: currentPath,
              key: rhsKey,
              stack,
              orderIndependent,
            });
          }
        });
      }
      stack.length -= 1;
    } else if (lhs !== rhs) {
      // lhs is contains a cycle at this element and it differs from rhs
      changes.push({ k: 'E', p: currentPath, l: lhs, r: rhs });
    }
  } else if (lhs !== rhs) {
    if (!(typeof lhs === 'number' && Number.isNaN(lhs) && Number.isNaN(rhs))) {
      changes.push({ k: 'E', p: currentPath, l: lhs, r: rhs });
    }
  }
};

export const revertChange = (target, change) => {
  if (target && change?.kind) {
    let it = target;
    let i;

    const u = change.path.length - 1;
    for (i = 0; i < u; i++) {
      if (typeof it[change.path[i]] === 'undefined') {
        it[change.path[i]] = {};
      }
      it = it[change.path[i]];
    }
    switch (change.kind) {
      case 'A':
        // Array was modified...
        // it will be an array...
        revertArrayChange(it[change.path[i]], change.index, change.item);
        break;
      case 'D':
        // Item was deleted...
        it[change.path[i]] = change.lhs;
        break;
      case 'E':
        // Item was edited...
        it[change.path[i]] = change.lhs;
        break;
      case 'N':
        // Item is new...
        delete it[change.path[i]];
        break;
      default:
        '';
    }
  }
};

export const observableDiff = (
  lhs: mixed,
  rhs: mixed,
  observer: ((diff: RawChangeT) => void) | null,
  prefilter: PrefilterT,
  orderIndependent: boolean
): Array<RawChangeT> => {
  const changes = [];
  deepDiff(lhs, rhs, changes, { prefilter, orderIndependent });
  if (observer) {
    changes.forEach(change => {
      // $FlowFixMe
      observer(change);
    });
  }
  return changes;
};

export const findDiff = (
  lhs: mixed,
  rhs: mixed,
  orderIndependent: boolean,
  prefilter: PrefilterT,
  accum: any
): Array<RawChangeT> => {
  const observer = accum
    ? difference => {
        if (difference) {
          if (!accum.push) throw new Error(`accum should have a 'push()' function`);
          accum.push(difference);
        }
      }
    : null;
  const changes = observableDiff(lhs, rhs, observer, prefilter, orderIndependent);

  return accum || changes;
};
