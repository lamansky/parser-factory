'use strict'

const arrify = require('arrify')
const caseInsensitive = require('case-insensitive')
const enforceRange = require('enforce-range')
const isInstanceOf = require('is-instance-of')
const longestFirst = require('longest-first')
const {get, has} = require('m-o')
const vfn = require('vfn')

module.exports = (defaultController, controllers) => (userStr, ...userArgs) => (function parseStr (initialController, str, permArgObj, initialTempArgObj = {}) {
  const r = enforceRange(0, str.length)
  let pos = 0
  let out

  function callController (controllerId, tempArgObj) {
    if (!has(controllers, controllerId)) throw new RangeError('Controller not registered: ' + controllerId)

    const bracket = (nextControllerId, start, end, throughEndArg, subArg) => {
      return sub(nextControllerId, throughEnd(start, end, throughEndArg), subArg)
    }
    const call = (nextControllerId, newTempArgObj) => callController(nextControllerId, newTempArgObj)
    const char = (len = 1, offset = 0) => str.substring(...[r(pos + offset), r(pos + offset + len)].sort())
    const consume = vfn({arg: 0, oo: true}, (substrings, options = {}) => {
      for (const substring of longestFirst(substrings)) {
        if (is(substring, options)) return shift(substring.length)
      }
      return ''
    })
    const consumeRest = vfn({arg: 0, oo: true}, (substrings, options = {}) => {
      for (const substring of longestFirst(substrings)) {
        if (isOnly(substring, options)) return shift(substring.length)
      }
      return ''
    })
    const consumeWhile = test => {
      let substr = ''
      if (typeof test === 'string') {
        while (char() && test.includes(char())) substr += shift()
      } else if (typeof test === 'function') {
        while (char() && test(char())) substr += shift()
      } else if (isInstanceOf(test, 'RegExp')) {
        while (char() && test.test(char())) substr += shift()
      } else {
        throw new TypeError('consumeWhile() test must be RegExp, string, or function')
      }
      return substr
    }
    const is = vfn({arg: 0, oo: true}, (substrings, {ci} = {}) => substrings.some(ci ? ss => caseInsensitive(char(ss.length)).equals(ss) : ss => char(ss.length) === ss))
    const isOnly = vfn({arg: 0, oo: true}, (substrings, {ci} = {}) => substrings.some(ci ? ss => caseInsensitive(char(Infinity)).equals(ss) : ss => char(Infinity) === ss))
    const push = elem => {
      if (typeof elem === 'string' && (typeof out === 'string' || typeof out === 'undefined')) {
        if (typeof out === 'undefined') out = ''
        out += elem
      } else {
        out = arrify(out)
        out.push(...arrify(elem))
      }
    }
    const shift = (number = 1) => { const chars = char(number); pos = r(pos + number); return chars }
    const sub = (subController, subStr, subTempArgObj) => parseStr(subController, subStr, permArgObj, subTempArgObj)
    const through = vfn({arg: 0, oo: true}, (ends, options = {}) => {
      return until(...ends, {...options, inclusive: true})
    })
    const throughEnd = (start, end, ...args) => {
      const result = untilEnd(start, end, ...args)
      consume(end)
      return result
    }
    const until = vfn({arg: 0, oo: true}, (ends, {escape: esc, ignore, inclusive} = {}) => {
      let substr = ''
      while (char()) {
        if (is(...ends)) {
          if (inclusive) substr += consume(...ends)
          break
        }
        let found = false
        for (const end of ends) {
          if (consume(esc + end)) {
            substr += end
            found = true
            break
          }
        }
        if (!found && !foundPair(ignore, x => { substr += x })) substr += shift()
      }
      return substr
    })
    const untilEnd = (start, end, {escape: esc, ignore} = {}) => {
      let substr = ''
      let nestLevel = 0

      if (ignore) ignore = ignore.filter(([startIgnore, endIgnore]) => startIgnore !== start && endIgnore !== end)

      while (char()) {
        if (is(start)) {
          nestLevel++
        } else if (is(end)) {
          if (nestLevel-- === 0) return substr
        } else if (esc) {
          if (consume(esc + start)) {
            substr += start
            continue
          }
          if (consume(esc + end)) {
            substr += end
            continue
          }
        }
        if (!foundPair(ignore, x => { substr += x })) substr += shift()
      }
      return substr
    }

    function foundPair (pairs = [], append) {
      for (const [start, end, options = {}] of pairs) {
        if (is(start)) {
          append(consume(start) + (start === end ? until(end, options) : untilEnd(start, end, options)) + consume(end))
          return true
        }
      }
      return false
    }

    return get(controllers, controllerId)({
      bracket, call, char, consume, consumeRest, consumeWhile, is, isOnly, push, shift, sub, through, throughEnd, until, untilEnd,
    }, permArgObj, tempArgObj)
  }

  const cbr = callController(initialController, initialTempArgObj)
  return typeof cbr === 'undefined' ? out : cbr
})(defaultController, userStr, {userArgs})
