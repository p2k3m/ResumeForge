(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity)
      fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy)
      fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous")
      fetchOpts.credentials = "omit";
    else
      fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const index = "";
function getDefaultExportFromCjs(x2) {
  return x2 && x2.__esModule && Object.prototype.hasOwnProperty.call(x2, "default") ? x2["default"] : x2;
}
var react = { exports: {} };
var react_production_min = {};
/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var l$1 = Symbol.for("react.element"), n$1 = Symbol.for("react.portal"), p$2 = Symbol.for("react.fragment"), q$1 = Symbol.for("react.strict_mode"), r = Symbol.for("react.profiler"), t = Symbol.for("react.provider"), u = Symbol.for("react.context"), v$1 = Symbol.for("react.forward_ref"), w = Symbol.for("react.suspense"), x = Symbol.for("react.memo"), y = Symbol.for("react.lazy"), z$1 = Symbol.iterator;
function A$1(a) {
  if (null === a || "object" !== typeof a)
    return null;
  a = z$1 && a[z$1] || a["@@iterator"];
  return "function" === typeof a ? a : null;
}
var B$1 = { isMounted: function() {
  return false;
}, enqueueForceUpdate: function() {
}, enqueueReplaceState: function() {
}, enqueueSetState: function() {
} }, C$1 = Object.assign, D$1 = {};
function E$1(a, b, e) {
  this.props = a;
  this.context = b;
  this.refs = D$1;
  this.updater = e || B$1;
}
E$1.prototype.isReactComponent = {};
E$1.prototype.setState = function(a, b) {
  if ("object" !== typeof a && "function" !== typeof a && null != a)
    throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
  this.updater.enqueueSetState(this, a, b, "setState");
};
E$1.prototype.forceUpdate = function(a) {
  this.updater.enqueueForceUpdate(this, a, "forceUpdate");
};
function F() {
}
F.prototype = E$1.prototype;
function G$1(a, b, e) {
  this.props = a;
  this.context = b;
  this.refs = D$1;
  this.updater = e || B$1;
}
var H$1 = G$1.prototype = new F();
H$1.constructor = G$1;
C$1(H$1, E$1.prototype);
H$1.isPureReactComponent = true;
var I$1 = Array.isArray, J = Object.prototype.hasOwnProperty, K$1 = { current: null }, L$1 = { key: true, ref: true, __self: true, __source: true };
function M$1(a, b, e) {
  var d, c = {}, k2 = null, h = null;
  if (null != b)
    for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k2 = "" + b.key), b)
      J.call(b, d) && !L$1.hasOwnProperty(d) && (c[d] = b[d]);
  var g = arguments.length - 2;
  if (1 === g)
    c.children = e;
  else if (1 < g) {
    for (var f2 = Array(g), m2 = 0; m2 < g; m2++)
      f2[m2] = arguments[m2 + 2];
    c.children = f2;
  }
  if (a && a.defaultProps)
    for (d in g = a.defaultProps, g)
      void 0 === c[d] && (c[d] = g[d]);
  return { $$typeof: l$1, type: a, key: k2, ref: h, props: c, _owner: K$1.current };
}
function N$1(a, b) {
  return { $$typeof: l$1, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
}
function O$1(a) {
  return "object" === typeof a && null !== a && a.$$typeof === l$1;
}
function escape(a) {
  var b = { "=": "=0", ":": "=2" };
  return "$" + a.replace(/[=:]/g, function(a2) {
    return b[a2];
  });
}
var P$1 = /\/+/g;
function Q$1(a, b) {
  return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
}
function R$1(a, b, e, d, c) {
  var k2 = typeof a;
  if ("undefined" === k2 || "boolean" === k2)
    a = null;
  var h = false;
  if (null === a)
    h = true;
  else
    switch (k2) {
      case "string":
      case "number":
        h = true;
        break;
      case "object":
        switch (a.$$typeof) {
          case l$1:
          case n$1:
            h = true;
        }
    }
  if (h)
    return h = a, c = c(h), a = "" === d ? "." + Q$1(h, 0) : d, I$1(c) ? (e = "", null != a && (e = a.replace(P$1, "$&/") + "/"), R$1(c, b, e, "", function(a2) {
      return a2;
    })) : null != c && (O$1(c) && (c = N$1(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P$1, "$&/") + "/") + a)), b.push(c)), 1;
  h = 0;
  d = "" === d ? "." : d + ":";
  if (I$1(a))
    for (var g = 0; g < a.length; g++) {
      k2 = a[g];
      var f2 = d + Q$1(k2, g);
      h += R$1(k2, b, e, f2, c);
    }
  else if (f2 = A$1(a), "function" === typeof f2)
    for (a = f2.call(a), g = 0; !(k2 = a.next()).done; )
      k2 = k2.value, f2 = d + Q$1(k2, g++), h += R$1(k2, b, e, f2, c);
  else if ("object" === k2)
    throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
  return h;
}
function S$1(a, b, e) {
  if (null == a)
    return a;
  var d = [], c = 0;
  R$1(a, d, "", "", function(a2) {
    return b.call(e, a2, c++);
  });
  return d;
}
function T$1(a) {
  if (-1 === a._status) {
    var b = a._result;
    b = b();
    b.then(function(b2) {
      if (0 === a._status || -1 === a._status)
        a._status = 1, a._result = b2;
    }, function(b2) {
      if (0 === a._status || -1 === a._status)
        a._status = 2, a._result = b2;
    });
    -1 === a._status && (a._status = 0, a._result = b);
  }
  if (1 === a._status)
    return a._result.default;
  throw a._result;
}
var U$1 = { current: null }, V$1 = { transition: null }, W$1 = { ReactCurrentDispatcher: U$1, ReactCurrentBatchConfig: V$1, ReactCurrentOwner: K$1 };
function X$1() {
  throw Error("act(...) is not supported in production builds of React.");
}
react_production_min.Children = { map: S$1, forEach: function(a, b, e) {
  S$1(a, function() {
    b.apply(this, arguments);
  }, e);
}, count: function(a) {
  var b = 0;
  S$1(a, function() {
    b++;
  });
  return b;
}, toArray: function(a) {
  return S$1(a, function(a2) {
    return a2;
  }) || [];
}, only: function(a) {
  if (!O$1(a))
    throw Error("React.Children.only expected to receive a single React element child.");
  return a;
} };
react_production_min.Component = E$1;
react_production_min.Fragment = p$2;
react_production_min.Profiler = r;
react_production_min.PureComponent = G$1;
react_production_min.StrictMode = q$1;
react_production_min.Suspense = w;
react_production_min.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W$1;
react_production_min.act = X$1;
react_production_min.cloneElement = function(a, b, e) {
  if (null === a || void 0 === a)
    throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
  var d = C$1({}, a.props), c = a.key, k2 = a.ref, h = a._owner;
  if (null != b) {
    void 0 !== b.ref && (k2 = b.ref, h = K$1.current);
    void 0 !== b.key && (c = "" + b.key);
    if (a.type && a.type.defaultProps)
      var g = a.type.defaultProps;
    for (f2 in b)
      J.call(b, f2) && !L$1.hasOwnProperty(f2) && (d[f2] = void 0 === b[f2] && void 0 !== g ? g[f2] : b[f2]);
  }
  var f2 = arguments.length - 2;
  if (1 === f2)
    d.children = e;
  else if (1 < f2) {
    g = Array(f2);
    for (var m2 = 0; m2 < f2; m2++)
      g[m2] = arguments[m2 + 2];
    d.children = g;
  }
  return { $$typeof: l$1, type: a.type, key: c, ref: k2, props: d, _owner: h };
};
react_production_min.createContext = function(a) {
  a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
  a.Provider = { $$typeof: t, _context: a };
  return a.Consumer = a;
};
react_production_min.createElement = M$1;
react_production_min.createFactory = function(a) {
  var b = M$1.bind(null, a);
  b.type = a;
  return b;
};
react_production_min.createRef = function() {
  return { current: null };
};
react_production_min.forwardRef = function(a) {
  return { $$typeof: v$1, render: a };
};
react_production_min.isValidElement = O$1;
react_production_min.lazy = function(a) {
  return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T$1 };
};
react_production_min.memo = function(a, b) {
  return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
};
react_production_min.startTransition = function(a) {
  var b = V$1.transition;
  V$1.transition = {};
  try {
    a();
  } finally {
    V$1.transition = b;
  }
};
react_production_min.unstable_act = X$1;
react_production_min.useCallback = function(a, b) {
  return U$1.current.useCallback(a, b);
};
react_production_min.useContext = function(a) {
  return U$1.current.useContext(a);
};
react_production_min.useDebugValue = function() {
};
react_production_min.useDeferredValue = function(a) {
  return U$1.current.useDeferredValue(a);
};
react_production_min.useEffect = function(a, b) {
  return U$1.current.useEffect(a, b);
};
react_production_min.useId = function() {
  return U$1.current.useId();
};
react_production_min.useImperativeHandle = function(a, b, e) {
  return U$1.current.useImperativeHandle(a, b, e);
};
react_production_min.useInsertionEffect = function(a, b) {
  return U$1.current.useInsertionEffect(a, b);
};
react_production_min.useLayoutEffect = function(a, b) {
  return U$1.current.useLayoutEffect(a, b);
};
react_production_min.useMemo = function(a, b) {
  return U$1.current.useMemo(a, b);
};
react_production_min.useReducer = function(a, b, e) {
  return U$1.current.useReducer(a, b, e);
};
react_production_min.useRef = function(a) {
  return U$1.current.useRef(a);
};
react_production_min.useState = function(a) {
  return U$1.current.useState(a);
};
react_production_min.useSyncExternalStore = function(a, b, e) {
  return U$1.current.useSyncExternalStore(a, b, e);
};
react_production_min.useTransition = function() {
  return U$1.current.useTransition();
};
react_production_min.version = "18.3.1";
{
  react.exports = react_production_min;
}
var reactExports = react.exports;
const React = /* @__PURE__ */ getDefaultExportFromCjs(reactExports);
var reactDom = { exports: {} };
var reactDom_production_min = {};
var scheduler = { exports: {} };
var scheduler_production_min = {};
/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
(function(exports) {
  function f2(a, b) {
    var c = a.length;
    a.push(b);
    a:
      for (; 0 < c; ) {
        var d = c - 1 >>> 1, e = a[d];
        if (0 < g(e, b))
          a[d] = b, a[c] = e, c = d;
        else
          break a;
      }
  }
  function h(a) {
    return 0 === a.length ? null : a[0];
  }
  function k2(a) {
    if (0 === a.length)
      return null;
    var b = a[0], c = a.pop();
    if (c !== b) {
      a[0] = c;
      a:
        for (var d = 0, e = a.length, w2 = e >>> 1; d < w2; ) {
          var m2 = 2 * (d + 1) - 1, C2 = a[m2], n2 = m2 + 1, x2 = a[n2];
          if (0 > g(C2, c))
            n2 < e && 0 > g(x2, C2) ? (a[d] = x2, a[n2] = c, d = n2) : (a[d] = C2, a[m2] = c, d = m2);
          else if (n2 < e && 0 > g(x2, c))
            a[d] = x2, a[n2] = c, d = n2;
          else
            break a;
        }
    }
    return b;
  }
  function g(a, b) {
    var c = a.sortIndex - b.sortIndex;
    return 0 !== c ? c : a.id - b.id;
  }
  if ("object" === typeof performance && "function" === typeof performance.now) {
    var l2 = performance;
    exports.unstable_now = function() {
      return l2.now();
    };
  } else {
    var p2 = Date, q2 = p2.now();
    exports.unstable_now = function() {
      return p2.now() - q2;
    };
  }
  var r2 = [], t2 = [], u2 = 1, v2 = null, y2 = 3, z2 = false, A2 = false, B2 = false, D2 = "function" === typeof setTimeout ? setTimeout : null, E2 = "function" === typeof clearTimeout ? clearTimeout : null, F2 = "undefined" !== typeof setImmediate ? setImmediate : null;
  "undefined" !== typeof navigator && void 0 !== navigator.scheduling && void 0 !== navigator.scheduling.isInputPending && navigator.scheduling.isInputPending.bind(navigator.scheduling);
  function G2(a) {
    for (var b = h(t2); null !== b; ) {
      if (null === b.callback)
        k2(t2);
      else if (b.startTime <= a)
        k2(t2), b.sortIndex = b.expirationTime, f2(r2, b);
      else
        break;
      b = h(t2);
    }
  }
  function H2(a) {
    B2 = false;
    G2(a);
    if (!A2)
      if (null !== h(r2))
        A2 = true, I2(J2);
      else {
        var b = h(t2);
        null !== b && K2(H2, b.startTime - a);
      }
  }
  function J2(a, b) {
    A2 = false;
    B2 && (B2 = false, E2(L2), L2 = -1);
    z2 = true;
    var c = y2;
    try {
      G2(b);
      for (v2 = h(r2); null !== v2 && (!(v2.expirationTime > b) || a && !M2()); ) {
        var d = v2.callback;
        if ("function" === typeof d) {
          v2.callback = null;
          y2 = v2.priorityLevel;
          var e = d(v2.expirationTime <= b);
          b = exports.unstable_now();
          "function" === typeof e ? v2.callback = e : v2 === h(r2) && k2(r2);
          G2(b);
        } else
          k2(r2);
        v2 = h(r2);
      }
      if (null !== v2)
        var w2 = true;
      else {
        var m2 = h(t2);
        null !== m2 && K2(H2, m2.startTime - b);
        w2 = false;
      }
      return w2;
    } finally {
      v2 = null, y2 = c, z2 = false;
    }
  }
  var N2 = false, O2 = null, L2 = -1, P2 = 5, Q2 = -1;
  function M2() {
    return exports.unstable_now() - Q2 < P2 ? false : true;
  }
  function R2() {
    if (null !== O2) {
      var a = exports.unstable_now();
      Q2 = a;
      var b = true;
      try {
        b = O2(true, a);
      } finally {
        b ? S2() : (N2 = false, O2 = null);
      }
    } else
      N2 = false;
  }
  var S2;
  if ("function" === typeof F2)
    S2 = function() {
      F2(R2);
    };
  else if ("undefined" !== typeof MessageChannel) {
    var T2 = new MessageChannel(), U2 = T2.port2;
    T2.port1.onmessage = R2;
    S2 = function() {
      U2.postMessage(null);
    };
  } else
    S2 = function() {
      D2(R2, 0);
    };
  function I2(a) {
    O2 = a;
    N2 || (N2 = true, S2());
  }
  function K2(a, b) {
    L2 = D2(function() {
      a(exports.unstable_now());
    }, b);
  }
  exports.unstable_IdlePriority = 5;
  exports.unstable_ImmediatePriority = 1;
  exports.unstable_LowPriority = 4;
  exports.unstable_NormalPriority = 3;
  exports.unstable_Profiling = null;
  exports.unstable_UserBlockingPriority = 2;
  exports.unstable_cancelCallback = function(a) {
    a.callback = null;
  };
  exports.unstable_continueExecution = function() {
    A2 || z2 || (A2 = true, I2(J2));
  };
  exports.unstable_forceFrameRate = function(a) {
    0 > a || 125 < a ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P2 = 0 < a ? Math.floor(1e3 / a) : 5;
  };
  exports.unstable_getCurrentPriorityLevel = function() {
    return y2;
  };
  exports.unstable_getFirstCallbackNode = function() {
    return h(r2);
  };
  exports.unstable_next = function(a) {
    switch (y2) {
      case 1:
      case 2:
      case 3:
        var b = 3;
        break;
      default:
        b = y2;
    }
    var c = y2;
    y2 = b;
    try {
      return a();
    } finally {
      y2 = c;
    }
  };
  exports.unstable_pauseExecution = function() {
  };
  exports.unstable_requestPaint = function() {
  };
  exports.unstable_runWithPriority = function(a, b) {
    switch (a) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        a = 3;
    }
    var c = y2;
    y2 = a;
    try {
      return b();
    } finally {
      y2 = c;
    }
  };
  exports.unstable_scheduleCallback = function(a, b, c) {
    var d = exports.unstable_now();
    "object" === typeof c && null !== c ? (c = c.delay, c = "number" === typeof c && 0 < c ? d + c : d) : c = d;
    switch (a) {
      case 1:
        var e = -1;
        break;
      case 2:
        e = 250;
        break;
      case 5:
        e = 1073741823;
        break;
      case 4:
        e = 1e4;
        break;
      default:
        e = 5e3;
    }
    e = c + e;
    a = { id: u2++, callback: b, priorityLevel: a, startTime: c, expirationTime: e, sortIndex: -1 };
    c > d ? (a.sortIndex = c, f2(t2, a), null === h(r2) && a === h(t2) && (B2 ? (E2(L2), L2 = -1) : B2 = true, K2(H2, c - d))) : (a.sortIndex = e, f2(r2, a), A2 || z2 || (A2 = true, I2(J2)));
    return a;
  };
  exports.unstable_shouldYield = M2;
  exports.unstable_wrapCallback = function(a) {
    var b = y2;
    return function() {
      var c = y2;
      y2 = b;
      try {
        return a.apply(this, arguments);
      } finally {
        y2 = c;
      }
    };
  };
})(scheduler_production_min);
{
  scheduler.exports = scheduler_production_min;
}
var schedulerExports = scheduler.exports;
/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var aa = reactExports, ca = schedulerExports;
function p$1(a) {
  for (var b = "https://reactjs.org/docs/error-decoder.html?invariant=" + a, c = 1; c < arguments.length; c++)
    b += "&args[]=" + encodeURIComponent(arguments[c]);
  return "Minified React error #" + a + "; visit " + b + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var da = /* @__PURE__ */ new Set(), ea = {};
function fa(a, b) {
  ha(a, b);
  ha(a + "Capture", b);
}
function ha(a, b) {
  ea[a] = b;
  for (a = 0; a < b.length; a++)
    da.add(b[a]);
}
var ia = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement), ja = Object.prototype.hasOwnProperty, ka = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, la = {}, ma = {};
function oa(a) {
  if (ja.call(ma, a))
    return true;
  if (ja.call(la, a))
    return false;
  if (ka.test(a))
    return ma[a] = true;
  la[a] = true;
  return false;
}
function pa(a, b, c, d) {
  if (null !== c && 0 === c.type)
    return false;
  switch (typeof b) {
    case "function":
    case "symbol":
      return true;
    case "boolean":
      if (d)
        return false;
      if (null !== c)
        return !c.acceptsBooleans;
      a = a.toLowerCase().slice(0, 5);
      return "data-" !== a && "aria-" !== a;
    default:
      return false;
  }
}
function qa(a, b, c, d) {
  if (null === b || "undefined" === typeof b || pa(a, b, c, d))
    return true;
  if (d)
    return false;
  if (null !== c)
    switch (c.type) {
      case 3:
        return !b;
      case 4:
        return false === b;
      case 5:
        return isNaN(b);
      case 6:
        return isNaN(b) || 1 > b;
    }
  return false;
}
function v(a, b, c, d, e, f2, g) {
  this.acceptsBooleans = 2 === b || 3 === b || 4 === b;
  this.attributeName = d;
  this.attributeNamespace = e;
  this.mustUseProperty = c;
  this.propertyName = a;
  this.type = b;
  this.sanitizeURL = f2;
  this.removeEmptyString = g;
}
var z = {};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a) {
  z[a] = new v(a, 0, false, a, null, false, false);
});
[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(a) {
  var b = a[0];
  z[b] = new v(b, 1, false, a[1], null, false, false);
});
["contentEditable", "draggable", "spellCheck", "value"].forEach(function(a) {
  z[a] = new v(a, 2, false, a.toLowerCase(), null, false, false);
});
["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(a) {
  z[a] = new v(a, 2, false, a, null, false, false);
});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a) {
  z[a] = new v(a, 3, false, a.toLowerCase(), null, false, false);
});
["checked", "multiple", "muted", "selected"].forEach(function(a) {
  z[a] = new v(a, 3, true, a, null, false, false);
});
["capture", "download"].forEach(function(a) {
  z[a] = new v(a, 4, false, a, null, false, false);
});
["cols", "rows", "size", "span"].forEach(function(a) {
  z[a] = new v(a, 6, false, a, null, false, false);
});
["rowSpan", "start"].forEach(function(a) {
  z[a] = new v(a, 5, false, a.toLowerCase(), null, false, false);
});
var ra = /[\-:]([a-z])/g;
function sa(a) {
  return a[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a) {
  var b = a.replace(
    ra,
    sa
  );
  z[b] = new v(b, 1, false, a, null, false, false);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a) {
  var b = a.replace(ra, sa);
  z[b] = new v(b, 1, false, a, "http://www.w3.org/1999/xlink", false, false);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(a) {
  var b = a.replace(ra, sa);
  z[b] = new v(b, 1, false, a, "http://www.w3.org/XML/1998/namespace", false, false);
});
["tabIndex", "crossOrigin"].forEach(function(a) {
  z[a] = new v(a, 1, false, a.toLowerCase(), null, false, false);
});
z.xlinkHref = new v("xlinkHref", 1, false, "xlink:href", "http://www.w3.org/1999/xlink", true, false);
["src", "href", "action", "formAction"].forEach(function(a) {
  z[a] = new v(a, 1, false, a.toLowerCase(), null, true, true);
});
function ta(a, b, c, d) {
  var e = z.hasOwnProperty(b) ? z[b] : null;
  if (null !== e ? 0 !== e.type : d || !(2 < b.length) || "o" !== b[0] && "O" !== b[0] || "n" !== b[1] && "N" !== b[1])
    qa(b, c, e, d) && (c = null), d || null === e ? oa(b) && (null === c ? a.removeAttribute(b) : a.setAttribute(b, "" + c)) : e.mustUseProperty ? a[e.propertyName] = null === c ? 3 === e.type ? false : "" : c : (b = e.attributeName, d = e.attributeNamespace, null === c ? a.removeAttribute(b) : (e = e.type, c = 3 === e || 4 === e && true === c ? "" : "" + c, d ? a.setAttributeNS(d, b, c) : a.setAttribute(b, c)));
}
var ua = aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, va = Symbol.for("react.element"), wa = Symbol.for("react.portal"), ya = Symbol.for("react.fragment"), za = Symbol.for("react.strict_mode"), Aa = Symbol.for("react.profiler"), Ba = Symbol.for("react.provider"), Ca = Symbol.for("react.context"), Da = Symbol.for("react.forward_ref"), Ea = Symbol.for("react.suspense"), Fa = Symbol.for("react.suspense_list"), Ga = Symbol.for("react.memo"), Ha = Symbol.for("react.lazy");
var Ia = Symbol.for("react.offscreen");
var Ja = Symbol.iterator;
function Ka(a) {
  if (null === a || "object" !== typeof a)
    return null;
  a = Ja && a[Ja] || a["@@iterator"];
  return "function" === typeof a ? a : null;
}
var A = Object.assign, La;
function Ma(a) {
  if (void 0 === La)
    try {
      throw Error();
    } catch (c) {
      var b = c.stack.trim().match(/\n( *(at )?)/);
      La = b && b[1] || "";
    }
  return "\n" + La + a;
}
var Na = false;
function Oa(a, b) {
  if (!a || Na)
    return "";
  Na = true;
  var c = Error.prepareStackTrace;
  Error.prepareStackTrace = void 0;
  try {
    if (b)
      if (b = function() {
        throw Error();
      }, Object.defineProperty(b.prototype, "props", { set: function() {
        throw Error();
      } }), "object" === typeof Reflect && Reflect.construct) {
        try {
          Reflect.construct(b, []);
        } catch (l2) {
          var d = l2;
        }
        Reflect.construct(a, [], b);
      } else {
        try {
          b.call();
        } catch (l2) {
          d = l2;
        }
        a.call(b.prototype);
      }
    else {
      try {
        throw Error();
      } catch (l2) {
        d = l2;
      }
      a();
    }
  } catch (l2) {
    if (l2 && d && "string" === typeof l2.stack) {
      for (var e = l2.stack.split("\n"), f2 = d.stack.split("\n"), g = e.length - 1, h = f2.length - 1; 1 <= g && 0 <= h && e[g] !== f2[h]; )
        h--;
      for (; 1 <= g && 0 <= h; g--, h--)
        if (e[g] !== f2[h]) {
          if (1 !== g || 1 !== h) {
            do
              if (g--, h--, 0 > h || e[g] !== f2[h]) {
                var k2 = "\n" + e[g].replace(" at new ", " at ");
                a.displayName && k2.includes("<anonymous>") && (k2 = k2.replace("<anonymous>", a.displayName));
                return k2;
              }
            while (1 <= g && 0 <= h);
          }
          break;
        }
    }
  } finally {
    Na = false, Error.prepareStackTrace = c;
  }
  return (a = a ? a.displayName || a.name : "") ? Ma(a) : "";
}
function Pa(a) {
  switch (a.tag) {
    case 5:
      return Ma(a.type);
    case 16:
      return Ma("Lazy");
    case 13:
      return Ma("Suspense");
    case 19:
      return Ma("SuspenseList");
    case 0:
    case 2:
    case 15:
      return a = Oa(a.type, false), a;
    case 11:
      return a = Oa(a.type.render, false), a;
    case 1:
      return a = Oa(a.type, true), a;
    default:
      return "";
  }
}
function Qa(a) {
  if (null == a)
    return null;
  if ("function" === typeof a)
    return a.displayName || a.name || null;
  if ("string" === typeof a)
    return a;
  switch (a) {
    case ya:
      return "Fragment";
    case wa:
      return "Portal";
    case Aa:
      return "Profiler";
    case za:
      return "StrictMode";
    case Ea:
      return "Suspense";
    case Fa:
      return "SuspenseList";
  }
  if ("object" === typeof a)
    switch (a.$$typeof) {
      case Ca:
        return (a.displayName || "Context") + ".Consumer";
      case Ba:
        return (a._context.displayName || "Context") + ".Provider";
      case Da:
        var b = a.render;
        a = a.displayName;
        a || (a = b.displayName || b.name || "", a = "" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
        return a;
      case Ga:
        return b = a.displayName || null, null !== b ? b : Qa(a.type) || "Memo";
      case Ha:
        b = a._payload;
        a = a._init;
        try {
          return Qa(a(b));
        } catch (c) {
        }
    }
  return null;
}
function Ra(a) {
  var b = a.type;
  switch (a.tag) {
    case 24:
      return "Cache";
    case 9:
      return (b.displayName || "Context") + ".Consumer";
    case 10:
      return (b._context.displayName || "Context") + ".Provider";
    case 18:
      return "DehydratedFragment";
    case 11:
      return a = b.render, a = a.displayName || a.name || "", b.displayName || ("" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
    case 7:
      return "Fragment";
    case 5:
      return b;
    case 4:
      return "Portal";
    case 3:
      return "Root";
    case 6:
      return "Text";
    case 16:
      return Qa(b);
    case 8:
      return b === za ? "StrictMode" : "Mode";
    case 22:
      return "Offscreen";
    case 12:
      return "Profiler";
    case 21:
      return "Scope";
    case 13:
      return "Suspense";
    case 19:
      return "SuspenseList";
    case 25:
      return "TracingMarker";
    case 1:
    case 0:
    case 17:
    case 2:
    case 14:
    case 15:
      if ("function" === typeof b)
        return b.displayName || b.name || null;
      if ("string" === typeof b)
        return b;
  }
  return null;
}
function Sa(a) {
  switch (typeof a) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return a;
    case "object":
      return a;
    default:
      return "";
  }
}
function Ta(a) {
  var b = a.type;
  return (a = a.nodeName) && "input" === a.toLowerCase() && ("checkbox" === b || "radio" === b);
}
function Ua(a) {
  var b = Ta(a) ? "checked" : "value", c = Object.getOwnPropertyDescriptor(a.constructor.prototype, b), d = "" + a[b];
  if (!a.hasOwnProperty(b) && "undefined" !== typeof c && "function" === typeof c.get && "function" === typeof c.set) {
    var e = c.get, f2 = c.set;
    Object.defineProperty(a, b, { configurable: true, get: function() {
      return e.call(this);
    }, set: function(a2) {
      d = "" + a2;
      f2.call(this, a2);
    } });
    Object.defineProperty(a, b, { enumerable: c.enumerable });
    return { getValue: function() {
      return d;
    }, setValue: function(a2) {
      d = "" + a2;
    }, stopTracking: function() {
      a._valueTracker = null;
      delete a[b];
    } };
  }
}
function Va(a) {
  a._valueTracker || (a._valueTracker = Ua(a));
}
function Wa(a) {
  if (!a)
    return false;
  var b = a._valueTracker;
  if (!b)
    return true;
  var c = b.getValue();
  var d = "";
  a && (d = Ta(a) ? a.checked ? "true" : "false" : a.value);
  a = d;
  return a !== c ? (b.setValue(a), true) : false;
}
function Xa(a) {
  a = a || ("undefined" !== typeof document ? document : void 0);
  if ("undefined" === typeof a)
    return null;
  try {
    return a.activeElement || a.body;
  } catch (b) {
    return a.body;
  }
}
function Ya(a, b) {
  var c = b.checked;
  return A({}, b, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: null != c ? c : a._wrapperState.initialChecked });
}
function Za(a, b) {
  var c = null == b.defaultValue ? "" : b.defaultValue, d = null != b.checked ? b.checked : b.defaultChecked;
  c = Sa(null != b.value ? b.value : c);
  a._wrapperState = { initialChecked: d, initialValue: c, controlled: "checkbox" === b.type || "radio" === b.type ? null != b.checked : null != b.value };
}
function ab(a, b) {
  b = b.checked;
  null != b && ta(a, "checked", b, false);
}
function bb(a, b) {
  ab(a, b);
  var c = Sa(b.value), d = b.type;
  if (null != c)
    if ("number" === d) {
      if (0 === c && "" === a.value || a.value != c)
        a.value = "" + c;
    } else
      a.value !== "" + c && (a.value = "" + c);
  else if ("submit" === d || "reset" === d) {
    a.removeAttribute("value");
    return;
  }
  b.hasOwnProperty("value") ? cb(a, b.type, c) : b.hasOwnProperty("defaultValue") && cb(a, b.type, Sa(b.defaultValue));
  null == b.checked && null != b.defaultChecked && (a.defaultChecked = !!b.defaultChecked);
}
function db(a, b, c) {
  if (b.hasOwnProperty("value") || b.hasOwnProperty("defaultValue")) {
    var d = b.type;
    if (!("submit" !== d && "reset" !== d || void 0 !== b.value && null !== b.value))
      return;
    b = "" + a._wrapperState.initialValue;
    c || b === a.value || (a.value = b);
    a.defaultValue = b;
  }
  c = a.name;
  "" !== c && (a.name = "");
  a.defaultChecked = !!a._wrapperState.initialChecked;
  "" !== c && (a.name = c);
}
function cb(a, b, c) {
  if ("number" !== b || Xa(a.ownerDocument) !== a)
    null == c ? a.defaultValue = "" + a._wrapperState.initialValue : a.defaultValue !== "" + c && (a.defaultValue = "" + c);
}
var eb = Array.isArray;
function fb(a, b, c, d) {
  a = a.options;
  if (b) {
    b = {};
    for (var e = 0; e < c.length; e++)
      b["$" + c[e]] = true;
    for (c = 0; c < a.length; c++)
      e = b.hasOwnProperty("$" + a[c].value), a[c].selected !== e && (a[c].selected = e), e && d && (a[c].defaultSelected = true);
  } else {
    c = "" + Sa(c);
    b = null;
    for (e = 0; e < a.length; e++) {
      if (a[e].value === c) {
        a[e].selected = true;
        d && (a[e].defaultSelected = true);
        return;
      }
      null !== b || a[e].disabled || (b = a[e]);
    }
    null !== b && (b.selected = true);
  }
}
function gb(a, b) {
  if (null != b.dangerouslySetInnerHTML)
    throw Error(p$1(91));
  return A({}, b, { value: void 0, defaultValue: void 0, children: "" + a._wrapperState.initialValue });
}
function hb(a, b) {
  var c = b.value;
  if (null == c) {
    c = b.children;
    b = b.defaultValue;
    if (null != c) {
      if (null != b)
        throw Error(p$1(92));
      if (eb(c)) {
        if (1 < c.length)
          throw Error(p$1(93));
        c = c[0];
      }
      b = c;
    }
    null == b && (b = "");
    c = b;
  }
  a._wrapperState = { initialValue: Sa(c) };
}
function ib(a, b) {
  var c = Sa(b.value), d = Sa(b.defaultValue);
  null != c && (c = "" + c, c !== a.value && (a.value = c), null == b.defaultValue && a.defaultValue !== c && (a.defaultValue = c));
  null != d && (a.defaultValue = "" + d);
}
function jb(a) {
  var b = a.textContent;
  b === a._wrapperState.initialValue && "" !== b && null !== b && (a.value = b);
}
function kb(a) {
  switch (a) {
    case "svg":
      return "http://www.w3.org/2000/svg";
    case "math":
      return "http://www.w3.org/1998/Math/MathML";
    default:
      return "http://www.w3.org/1999/xhtml";
  }
}
function lb(a, b) {
  return null == a || "http://www.w3.org/1999/xhtml" === a ? kb(b) : "http://www.w3.org/2000/svg" === a && "foreignObject" === b ? "http://www.w3.org/1999/xhtml" : a;
}
var mb, nb = function(a) {
  return "undefined" !== typeof MSApp && MSApp.execUnsafeLocalFunction ? function(b, c, d, e) {
    MSApp.execUnsafeLocalFunction(function() {
      return a(b, c, d, e);
    });
  } : a;
}(function(a, b) {
  if ("http://www.w3.org/2000/svg" !== a.namespaceURI || "innerHTML" in a)
    a.innerHTML = b;
  else {
    mb = mb || document.createElement("div");
    mb.innerHTML = "<svg>" + b.valueOf().toString() + "</svg>";
    for (b = mb.firstChild; a.firstChild; )
      a.removeChild(a.firstChild);
    for (; b.firstChild; )
      a.appendChild(b.firstChild);
  }
});
function ob(a, b) {
  if (b) {
    var c = a.firstChild;
    if (c && c === a.lastChild && 3 === c.nodeType) {
      c.nodeValue = b;
      return;
    }
  }
  a.textContent = b;
}
var pb = {
  animationIterationCount: true,
  aspectRatio: true,
  borderImageOutset: true,
  borderImageSlice: true,
  borderImageWidth: true,
  boxFlex: true,
  boxFlexGroup: true,
  boxOrdinalGroup: true,
  columnCount: true,
  columns: true,
  flex: true,
  flexGrow: true,
  flexPositive: true,
  flexShrink: true,
  flexNegative: true,
  flexOrder: true,
  gridArea: true,
  gridRow: true,
  gridRowEnd: true,
  gridRowSpan: true,
  gridRowStart: true,
  gridColumn: true,
  gridColumnEnd: true,
  gridColumnSpan: true,
  gridColumnStart: true,
  fontWeight: true,
  lineClamp: true,
  lineHeight: true,
  opacity: true,
  order: true,
  orphans: true,
  tabSize: true,
  widows: true,
  zIndex: true,
  zoom: true,
  fillOpacity: true,
  floodOpacity: true,
  stopOpacity: true,
  strokeDasharray: true,
  strokeDashoffset: true,
  strokeMiterlimit: true,
  strokeOpacity: true,
  strokeWidth: true
}, qb = ["Webkit", "ms", "Moz", "O"];
Object.keys(pb).forEach(function(a) {
  qb.forEach(function(b) {
    b = b + a.charAt(0).toUpperCase() + a.substring(1);
    pb[b] = pb[a];
  });
});
function rb(a, b, c) {
  return null == b || "boolean" === typeof b || "" === b ? "" : c || "number" !== typeof b || 0 === b || pb.hasOwnProperty(a) && pb[a] ? ("" + b).trim() : b + "px";
}
function sb(a, b) {
  a = a.style;
  for (var c in b)
    if (b.hasOwnProperty(c)) {
      var d = 0 === c.indexOf("--"), e = rb(c, b[c], d);
      "float" === c && (c = "cssFloat");
      d ? a.setProperty(c, e) : a[c] = e;
    }
}
var tb = A({ menuitem: true }, { area: true, base: true, br: true, col: true, embed: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true });
function ub(a, b) {
  if (b) {
    if (tb[a] && (null != b.children || null != b.dangerouslySetInnerHTML))
      throw Error(p$1(137, a));
    if (null != b.dangerouslySetInnerHTML) {
      if (null != b.children)
        throw Error(p$1(60));
      if ("object" !== typeof b.dangerouslySetInnerHTML || !("__html" in b.dangerouslySetInnerHTML))
        throw Error(p$1(61));
    }
    if (null != b.style && "object" !== typeof b.style)
      throw Error(p$1(62));
  }
}
function vb(a, b) {
  if (-1 === a.indexOf("-"))
    return "string" === typeof b.is;
  switch (a) {
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return false;
    default:
      return true;
  }
}
var wb = null;
function xb(a) {
  a = a.target || a.srcElement || window;
  a.correspondingUseElement && (a = a.correspondingUseElement);
  return 3 === a.nodeType ? a.parentNode : a;
}
var yb = null, zb = null, Ab = null;
function Bb(a) {
  if (a = Cb(a)) {
    if ("function" !== typeof yb)
      throw Error(p$1(280));
    var b = a.stateNode;
    b && (b = Db(b), yb(a.stateNode, a.type, b));
  }
}
function Eb(a) {
  zb ? Ab ? Ab.push(a) : Ab = [a] : zb = a;
}
function Fb() {
  if (zb) {
    var a = zb, b = Ab;
    Ab = zb = null;
    Bb(a);
    if (b)
      for (a = 0; a < b.length; a++)
        Bb(b[a]);
  }
}
function Gb(a, b) {
  return a(b);
}
function Hb() {
}
var Ib = false;
function Jb(a, b, c) {
  if (Ib)
    return a(b, c);
  Ib = true;
  try {
    return Gb(a, b, c);
  } finally {
    if (Ib = false, null !== zb || null !== Ab)
      Hb(), Fb();
  }
}
function Kb(a, b) {
  var c = a.stateNode;
  if (null === c)
    return null;
  var d = Db(c);
  if (null === d)
    return null;
  c = d[b];
  a:
    switch (b) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (d = !d.disabled) || (a = a.type, d = !("button" === a || "input" === a || "select" === a || "textarea" === a));
        a = !d;
        break a;
      default:
        a = false;
    }
  if (a)
    return null;
  if (c && "function" !== typeof c)
    throw Error(p$1(231, b, typeof c));
  return c;
}
var Lb = false;
if (ia)
  try {
    var Mb = {};
    Object.defineProperty(Mb, "passive", { get: function() {
      Lb = true;
    } });
    window.addEventListener("test", Mb, Mb);
    window.removeEventListener("test", Mb, Mb);
  } catch (a) {
    Lb = false;
  }
function Nb(a, b, c, d, e, f2, g, h, k2) {
  var l2 = Array.prototype.slice.call(arguments, 3);
  try {
    b.apply(c, l2);
  } catch (m2) {
    this.onError(m2);
  }
}
var Ob = false, Pb = null, Qb = false, Rb = null, Sb = { onError: function(a) {
  Ob = true;
  Pb = a;
} };
function Tb(a, b, c, d, e, f2, g, h, k2) {
  Ob = false;
  Pb = null;
  Nb.apply(Sb, arguments);
}
function Ub(a, b, c, d, e, f2, g, h, k2) {
  Tb.apply(this, arguments);
  if (Ob) {
    if (Ob) {
      var l2 = Pb;
      Ob = false;
      Pb = null;
    } else
      throw Error(p$1(198));
    Qb || (Qb = true, Rb = l2);
  }
}
function Vb(a) {
  var b = a, c = a;
  if (a.alternate)
    for (; b.return; )
      b = b.return;
  else {
    a = b;
    do
      b = a, 0 !== (b.flags & 4098) && (c = b.return), a = b.return;
    while (a);
  }
  return 3 === b.tag ? c : null;
}
function Wb(a) {
  if (13 === a.tag) {
    var b = a.memoizedState;
    null === b && (a = a.alternate, null !== a && (b = a.memoizedState));
    if (null !== b)
      return b.dehydrated;
  }
  return null;
}
function Xb(a) {
  if (Vb(a) !== a)
    throw Error(p$1(188));
}
function Yb(a) {
  var b = a.alternate;
  if (!b) {
    b = Vb(a);
    if (null === b)
      throw Error(p$1(188));
    return b !== a ? null : a;
  }
  for (var c = a, d = b; ; ) {
    var e = c.return;
    if (null === e)
      break;
    var f2 = e.alternate;
    if (null === f2) {
      d = e.return;
      if (null !== d) {
        c = d;
        continue;
      }
      break;
    }
    if (e.child === f2.child) {
      for (f2 = e.child; f2; ) {
        if (f2 === c)
          return Xb(e), a;
        if (f2 === d)
          return Xb(e), b;
        f2 = f2.sibling;
      }
      throw Error(p$1(188));
    }
    if (c.return !== d.return)
      c = e, d = f2;
    else {
      for (var g = false, h = e.child; h; ) {
        if (h === c) {
          g = true;
          c = e;
          d = f2;
          break;
        }
        if (h === d) {
          g = true;
          d = e;
          c = f2;
          break;
        }
        h = h.sibling;
      }
      if (!g) {
        for (h = f2.child; h; ) {
          if (h === c) {
            g = true;
            c = f2;
            d = e;
            break;
          }
          if (h === d) {
            g = true;
            d = f2;
            c = e;
            break;
          }
          h = h.sibling;
        }
        if (!g)
          throw Error(p$1(189));
      }
    }
    if (c.alternate !== d)
      throw Error(p$1(190));
  }
  if (3 !== c.tag)
    throw Error(p$1(188));
  return c.stateNode.current === c ? a : b;
}
function Zb(a) {
  a = Yb(a);
  return null !== a ? $b(a) : null;
}
function $b(a) {
  if (5 === a.tag || 6 === a.tag)
    return a;
  for (a = a.child; null !== a; ) {
    var b = $b(a);
    if (null !== b)
      return b;
    a = a.sibling;
  }
  return null;
}
var ac = ca.unstable_scheduleCallback, bc = ca.unstable_cancelCallback, cc = ca.unstable_shouldYield, dc = ca.unstable_requestPaint, B = ca.unstable_now, ec = ca.unstable_getCurrentPriorityLevel, fc = ca.unstable_ImmediatePriority, gc = ca.unstable_UserBlockingPriority, hc = ca.unstable_NormalPriority, ic = ca.unstable_LowPriority, jc = ca.unstable_IdlePriority, kc = null, lc = null;
function mc(a) {
  if (lc && "function" === typeof lc.onCommitFiberRoot)
    try {
      lc.onCommitFiberRoot(kc, a, void 0, 128 === (a.current.flags & 128));
    } catch (b) {
    }
}
var oc = Math.clz32 ? Math.clz32 : nc, pc = Math.log, qc = Math.LN2;
function nc(a) {
  a >>>= 0;
  return 0 === a ? 32 : 31 - (pc(a) / qc | 0) | 0;
}
var rc = 64, sc = 4194304;
function tc(a) {
  switch (a & -a) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 4:
      return 4;
    case 8:
      return 8;
    case 16:
      return 16;
    case 32:
      return 32;
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return a & 4194240;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return a & 130023424;
    case 134217728:
      return 134217728;
    case 268435456:
      return 268435456;
    case 536870912:
      return 536870912;
    case 1073741824:
      return 1073741824;
    default:
      return a;
  }
}
function uc(a, b) {
  var c = a.pendingLanes;
  if (0 === c)
    return 0;
  var d = 0, e = a.suspendedLanes, f2 = a.pingedLanes, g = c & 268435455;
  if (0 !== g) {
    var h = g & ~e;
    0 !== h ? d = tc(h) : (f2 &= g, 0 !== f2 && (d = tc(f2)));
  } else
    g = c & ~e, 0 !== g ? d = tc(g) : 0 !== f2 && (d = tc(f2));
  if (0 === d)
    return 0;
  if (0 !== b && b !== d && 0 === (b & e) && (e = d & -d, f2 = b & -b, e >= f2 || 16 === e && 0 !== (f2 & 4194240)))
    return b;
  0 !== (d & 4) && (d |= c & 16);
  b = a.entangledLanes;
  if (0 !== b)
    for (a = a.entanglements, b &= d; 0 < b; )
      c = 31 - oc(b), e = 1 << c, d |= a[c], b &= ~e;
  return d;
}
function vc(a, b) {
  switch (a) {
    case 1:
    case 2:
    case 4:
      return b + 250;
    case 8:
    case 16:
    case 32:
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return b + 5e3;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return -1;
    case 134217728:
    case 268435456:
    case 536870912:
    case 1073741824:
      return -1;
    default:
      return -1;
  }
}
function wc(a, b) {
  for (var c = a.suspendedLanes, d = a.pingedLanes, e = a.expirationTimes, f2 = a.pendingLanes; 0 < f2; ) {
    var g = 31 - oc(f2), h = 1 << g, k2 = e[g];
    if (-1 === k2) {
      if (0 === (h & c) || 0 !== (h & d))
        e[g] = vc(h, b);
    } else
      k2 <= b && (a.expiredLanes |= h);
    f2 &= ~h;
  }
}
function xc(a) {
  a = a.pendingLanes & -1073741825;
  return 0 !== a ? a : a & 1073741824 ? 1073741824 : 0;
}
function yc() {
  var a = rc;
  rc <<= 1;
  0 === (rc & 4194240) && (rc = 64);
  return a;
}
function zc(a) {
  for (var b = [], c = 0; 31 > c; c++)
    b.push(a);
  return b;
}
function Ac(a, b, c) {
  a.pendingLanes |= b;
  536870912 !== b && (a.suspendedLanes = 0, a.pingedLanes = 0);
  a = a.eventTimes;
  b = 31 - oc(b);
  a[b] = c;
}
function Bc(a, b) {
  var c = a.pendingLanes & ~b;
  a.pendingLanes = b;
  a.suspendedLanes = 0;
  a.pingedLanes = 0;
  a.expiredLanes &= b;
  a.mutableReadLanes &= b;
  a.entangledLanes &= b;
  b = a.entanglements;
  var d = a.eventTimes;
  for (a = a.expirationTimes; 0 < c; ) {
    var e = 31 - oc(c), f2 = 1 << e;
    b[e] = 0;
    d[e] = -1;
    a[e] = -1;
    c &= ~f2;
  }
}
function Cc(a, b) {
  var c = a.entangledLanes |= b;
  for (a = a.entanglements; c; ) {
    var d = 31 - oc(c), e = 1 << d;
    e & b | a[d] & b && (a[d] |= b);
    c &= ~e;
  }
}
var C = 0;
function Dc(a) {
  a &= -a;
  return 1 < a ? 4 < a ? 0 !== (a & 268435455) ? 16 : 536870912 : 4 : 1;
}
var Ec, Fc, Gc, Hc, Ic, Jc = false, Kc = [], Lc = null, Mc = null, Nc = null, Oc = /* @__PURE__ */ new Map(), Pc = /* @__PURE__ */ new Map(), Qc = [], Rc = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
function Sc(a, b) {
  switch (a) {
    case "focusin":
    case "focusout":
      Lc = null;
      break;
    case "dragenter":
    case "dragleave":
      Mc = null;
      break;
    case "mouseover":
    case "mouseout":
      Nc = null;
      break;
    case "pointerover":
    case "pointerout":
      Oc.delete(b.pointerId);
      break;
    case "gotpointercapture":
    case "lostpointercapture":
      Pc.delete(b.pointerId);
  }
}
function Tc(a, b, c, d, e, f2) {
  if (null === a || a.nativeEvent !== f2)
    return a = { blockedOn: b, domEventName: c, eventSystemFlags: d, nativeEvent: f2, targetContainers: [e] }, null !== b && (b = Cb(b), null !== b && Fc(b)), a;
  a.eventSystemFlags |= d;
  b = a.targetContainers;
  null !== e && -1 === b.indexOf(e) && b.push(e);
  return a;
}
function Uc(a, b, c, d, e) {
  switch (b) {
    case "focusin":
      return Lc = Tc(Lc, a, b, c, d, e), true;
    case "dragenter":
      return Mc = Tc(Mc, a, b, c, d, e), true;
    case "mouseover":
      return Nc = Tc(Nc, a, b, c, d, e), true;
    case "pointerover":
      var f2 = e.pointerId;
      Oc.set(f2, Tc(Oc.get(f2) || null, a, b, c, d, e));
      return true;
    case "gotpointercapture":
      return f2 = e.pointerId, Pc.set(f2, Tc(Pc.get(f2) || null, a, b, c, d, e)), true;
  }
  return false;
}
function Vc(a) {
  var b = Wc(a.target);
  if (null !== b) {
    var c = Vb(b);
    if (null !== c) {
      if (b = c.tag, 13 === b) {
        if (b = Wb(c), null !== b) {
          a.blockedOn = b;
          Ic(a.priority, function() {
            Gc(c);
          });
          return;
        }
      } else if (3 === b && c.stateNode.current.memoizedState.isDehydrated) {
        a.blockedOn = 3 === c.tag ? c.stateNode.containerInfo : null;
        return;
      }
    }
  }
  a.blockedOn = null;
}
function Xc(a) {
  if (null !== a.blockedOn)
    return false;
  for (var b = a.targetContainers; 0 < b.length; ) {
    var c = Yc(a.domEventName, a.eventSystemFlags, b[0], a.nativeEvent);
    if (null === c) {
      c = a.nativeEvent;
      var d = new c.constructor(c.type, c);
      wb = d;
      c.target.dispatchEvent(d);
      wb = null;
    } else
      return b = Cb(c), null !== b && Fc(b), a.blockedOn = c, false;
    b.shift();
  }
  return true;
}
function Zc(a, b, c) {
  Xc(a) && c.delete(b);
}
function $c() {
  Jc = false;
  null !== Lc && Xc(Lc) && (Lc = null);
  null !== Mc && Xc(Mc) && (Mc = null);
  null !== Nc && Xc(Nc) && (Nc = null);
  Oc.forEach(Zc);
  Pc.forEach(Zc);
}
function ad(a, b) {
  a.blockedOn === b && (a.blockedOn = null, Jc || (Jc = true, ca.unstable_scheduleCallback(ca.unstable_NormalPriority, $c)));
}
function bd(a) {
  function b(b2) {
    return ad(b2, a);
  }
  if (0 < Kc.length) {
    ad(Kc[0], a);
    for (var c = 1; c < Kc.length; c++) {
      var d = Kc[c];
      d.blockedOn === a && (d.blockedOn = null);
    }
  }
  null !== Lc && ad(Lc, a);
  null !== Mc && ad(Mc, a);
  null !== Nc && ad(Nc, a);
  Oc.forEach(b);
  Pc.forEach(b);
  for (c = 0; c < Qc.length; c++)
    d = Qc[c], d.blockedOn === a && (d.blockedOn = null);
  for (; 0 < Qc.length && (c = Qc[0], null === c.blockedOn); )
    Vc(c), null === c.blockedOn && Qc.shift();
}
var cd = ua.ReactCurrentBatchConfig, dd = true;
function ed(a, b, c, d) {
  var e = C, f2 = cd.transition;
  cd.transition = null;
  try {
    C = 1, fd(a, b, c, d);
  } finally {
    C = e, cd.transition = f2;
  }
}
function gd(a, b, c, d) {
  var e = C, f2 = cd.transition;
  cd.transition = null;
  try {
    C = 4, fd(a, b, c, d);
  } finally {
    C = e, cd.transition = f2;
  }
}
function fd(a, b, c, d) {
  if (dd) {
    var e = Yc(a, b, c, d);
    if (null === e)
      hd(a, b, d, id, c), Sc(a, d);
    else if (Uc(e, a, b, c, d))
      d.stopPropagation();
    else if (Sc(a, d), b & 4 && -1 < Rc.indexOf(a)) {
      for (; null !== e; ) {
        var f2 = Cb(e);
        null !== f2 && Ec(f2);
        f2 = Yc(a, b, c, d);
        null === f2 && hd(a, b, d, id, c);
        if (f2 === e)
          break;
        e = f2;
      }
      null !== e && d.stopPropagation();
    } else
      hd(a, b, d, null, c);
  }
}
var id = null;
function Yc(a, b, c, d) {
  id = null;
  a = xb(d);
  a = Wc(a);
  if (null !== a)
    if (b = Vb(a), null === b)
      a = null;
    else if (c = b.tag, 13 === c) {
      a = Wb(b);
      if (null !== a)
        return a;
      a = null;
    } else if (3 === c) {
      if (b.stateNode.current.memoizedState.isDehydrated)
        return 3 === b.tag ? b.stateNode.containerInfo : null;
      a = null;
    } else
      b !== a && (a = null);
  id = a;
  return null;
}
function jd(a) {
  switch (a) {
    case "cancel":
    case "click":
    case "close":
    case "contextmenu":
    case "copy":
    case "cut":
    case "auxclick":
    case "dblclick":
    case "dragend":
    case "dragstart":
    case "drop":
    case "focusin":
    case "focusout":
    case "input":
    case "invalid":
    case "keydown":
    case "keypress":
    case "keyup":
    case "mousedown":
    case "mouseup":
    case "paste":
    case "pause":
    case "play":
    case "pointercancel":
    case "pointerdown":
    case "pointerup":
    case "ratechange":
    case "reset":
    case "resize":
    case "seeked":
    case "submit":
    case "touchcancel":
    case "touchend":
    case "touchstart":
    case "volumechange":
    case "change":
    case "selectionchange":
    case "textInput":
    case "compositionstart":
    case "compositionend":
    case "compositionupdate":
    case "beforeblur":
    case "afterblur":
    case "beforeinput":
    case "blur":
    case "fullscreenchange":
    case "focus":
    case "hashchange":
    case "popstate":
    case "select":
    case "selectstart":
      return 1;
    case "drag":
    case "dragenter":
    case "dragexit":
    case "dragleave":
    case "dragover":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "pointermove":
    case "pointerout":
    case "pointerover":
    case "scroll":
    case "toggle":
    case "touchmove":
    case "wheel":
    case "mouseenter":
    case "mouseleave":
    case "pointerenter":
    case "pointerleave":
      return 4;
    case "message":
      switch (ec()) {
        case fc:
          return 1;
        case gc:
          return 4;
        case hc:
        case ic:
          return 16;
        case jc:
          return 536870912;
        default:
          return 16;
      }
    default:
      return 16;
  }
}
var kd = null, ld = null, md = null;
function nd() {
  if (md)
    return md;
  var a, b = ld, c = b.length, d, e = "value" in kd ? kd.value : kd.textContent, f2 = e.length;
  for (a = 0; a < c && b[a] === e[a]; a++)
    ;
  var g = c - a;
  for (d = 1; d <= g && b[c - d] === e[f2 - d]; d++)
    ;
  return md = e.slice(a, 1 < d ? 1 - d : void 0);
}
function od(a) {
  var b = a.keyCode;
  "charCode" in a ? (a = a.charCode, 0 === a && 13 === b && (a = 13)) : a = b;
  10 === a && (a = 13);
  return 32 <= a || 13 === a ? a : 0;
}
function pd() {
  return true;
}
function qd() {
  return false;
}
function rd(a) {
  function b(b2, d, e, f2, g) {
    this._reactName = b2;
    this._targetInst = e;
    this.type = d;
    this.nativeEvent = f2;
    this.target = g;
    this.currentTarget = null;
    for (var c in a)
      a.hasOwnProperty(c) && (b2 = a[c], this[c] = b2 ? b2(f2) : f2[c]);
    this.isDefaultPrevented = (null != f2.defaultPrevented ? f2.defaultPrevented : false === f2.returnValue) ? pd : qd;
    this.isPropagationStopped = qd;
    return this;
  }
  A(b.prototype, { preventDefault: function() {
    this.defaultPrevented = true;
    var a2 = this.nativeEvent;
    a2 && (a2.preventDefault ? a2.preventDefault() : "unknown" !== typeof a2.returnValue && (a2.returnValue = false), this.isDefaultPrevented = pd);
  }, stopPropagation: function() {
    var a2 = this.nativeEvent;
    a2 && (a2.stopPropagation ? a2.stopPropagation() : "unknown" !== typeof a2.cancelBubble && (a2.cancelBubble = true), this.isPropagationStopped = pd);
  }, persist: function() {
  }, isPersistent: pd });
  return b;
}
var sd = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(a) {
  return a.timeStamp || Date.now();
}, defaultPrevented: 0, isTrusted: 0 }, td = rd(sd), ud = A({}, sd, { view: 0, detail: 0 }), vd = rd(ud), wd, xd, yd, Ad = A({}, ud, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: zd, button: 0, buttons: 0, relatedTarget: function(a) {
  return void 0 === a.relatedTarget ? a.fromElement === a.srcElement ? a.toElement : a.fromElement : a.relatedTarget;
}, movementX: function(a) {
  if ("movementX" in a)
    return a.movementX;
  a !== yd && (yd && "mousemove" === a.type ? (wd = a.screenX - yd.screenX, xd = a.screenY - yd.screenY) : xd = wd = 0, yd = a);
  return wd;
}, movementY: function(a) {
  return "movementY" in a ? a.movementY : xd;
} }), Bd = rd(Ad), Cd = A({}, Ad, { dataTransfer: 0 }), Dd = rd(Cd), Ed = A({}, ud, { relatedTarget: 0 }), Fd = rd(Ed), Gd = A({}, sd, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), Hd = rd(Gd), Id = A({}, sd, { clipboardData: function(a) {
  return "clipboardData" in a ? a.clipboardData : window.clipboardData;
} }), Jd = rd(Id), Kd = A({}, sd, { data: 0 }), Ld = rd(Kd), Md = {
  Esc: "Escape",
  Spacebar: " ",
  Left: "ArrowLeft",
  Up: "ArrowUp",
  Right: "ArrowRight",
  Down: "ArrowDown",
  Del: "Delete",
  Win: "OS",
  Menu: "ContextMenu",
  Apps: "ContextMenu",
  Scroll: "ScrollLock",
  MozPrintableKey: "Unidentified"
}, Nd = {
  8: "Backspace",
  9: "Tab",
  12: "Clear",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  19: "Pause",
  20: "CapsLock",
  27: "Escape",
  32: " ",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  45: "Insert",
  46: "Delete",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12",
  144: "NumLock",
  145: "ScrollLock",
  224: "Meta"
}, Od = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
function Pd(a) {
  var b = this.nativeEvent;
  return b.getModifierState ? b.getModifierState(a) : (a = Od[a]) ? !!b[a] : false;
}
function zd() {
  return Pd;
}
var Qd = A({}, ud, { key: function(a) {
  if (a.key) {
    var b = Md[a.key] || a.key;
    if ("Unidentified" !== b)
      return b;
  }
  return "keypress" === a.type ? (a = od(a), 13 === a ? "Enter" : String.fromCharCode(a)) : "keydown" === a.type || "keyup" === a.type ? Nd[a.keyCode] || "Unidentified" : "";
}, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: zd, charCode: function(a) {
  return "keypress" === a.type ? od(a) : 0;
}, keyCode: function(a) {
  return "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
}, which: function(a) {
  return "keypress" === a.type ? od(a) : "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
} }), Rd = rd(Qd), Sd = A({}, Ad, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), Td = rd(Sd), Ud = A({}, ud, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: zd }), Vd = rd(Ud), Wd = A({}, sd, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), Xd = rd(Wd), Yd = A({}, Ad, {
  deltaX: function(a) {
    return "deltaX" in a ? a.deltaX : "wheelDeltaX" in a ? -a.wheelDeltaX : 0;
  },
  deltaY: function(a) {
    return "deltaY" in a ? a.deltaY : "wheelDeltaY" in a ? -a.wheelDeltaY : "wheelDelta" in a ? -a.wheelDelta : 0;
  },
  deltaZ: 0,
  deltaMode: 0
}), Zd = rd(Yd), $d = [9, 13, 27, 32], ae = ia && "CompositionEvent" in window, be = null;
ia && "documentMode" in document && (be = document.documentMode);
var ce = ia && "TextEvent" in window && !be, de = ia && (!ae || be && 8 < be && 11 >= be), ee = String.fromCharCode(32), fe = false;
function ge(a, b) {
  switch (a) {
    case "keyup":
      return -1 !== $d.indexOf(b.keyCode);
    case "keydown":
      return 229 !== b.keyCode;
    case "keypress":
    case "mousedown":
    case "focusout":
      return true;
    default:
      return false;
  }
}
function he(a) {
  a = a.detail;
  return "object" === typeof a && "data" in a ? a.data : null;
}
var ie = false;
function je(a, b) {
  switch (a) {
    case "compositionend":
      return he(b);
    case "keypress":
      if (32 !== b.which)
        return null;
      fe = true;
      return ee;
    case "textInput":
      return a = b.data, a === ee && fe ? null : a;
    default:
      return null;
  }
}
function ke(a, b) {
  if (ie)
    return "compositionend" === a || !ae && ge(a, b) ? (a = nd(), md = ld = kd = null, ie = false, a) : null;
  switch (a) {
    case "paste":
      return null;
    case "keypress":
      if (!(b.ctrlKey || b.altKey || b.metaKey) || b.ctrlKey && b.altKey) {
        if (b.char && 1 < b.char.length)
          return b.char;
        if (b.which)
          return String.fromCharCode(b.which);
      }
      return null;
    case "compositionend":
      return de && "ko" !== b.locale ? null : b.data;
    default:
      return null;
  }
}
var le = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
function me(a) {
  var b = a && a.nodeName && a.nodeName.toLowerCase();
  return "input" === b ? !!le[a.type] : "textarea" === b ? true : false;
}
function ne(a, b, c, d) {
  Eb(d);
  b = oe(b, "onChange");
  0 < b.length && (c = new td("onChange", "change", null, c, d), a.push({ event: c, listeners: b }));
}
var pe = null, qe = null;
function re(a) {
  se(a, 0);
}
function te(a) {
  var b = ue(a);
  if (Wa(b))
    return a;
}
function ve(a, b) {
  if ("change" === a)
    return b;
}
var we = false;
if (ia) {
  var xe;
  if (ia) {
    var ye = "oninput" in document;
    if (!ye) {
      var ze = document.createElement("div");
      ze.setAttribute("oninput", "return;");
      ye = "function" === typeof ze.oninput;
    }
    xe = ye;
  } else
    xe = false;
  we = xe && (!document.documentMode || 9 < document.documentMode);
}
function Ae() {
  pe && (pe.detachEvent("onpropertychange", Be), qe = pe = null);
}
function Be(a) {
  if ("value" === a.propertyName && te(qe)) {
    var b = [];
    ne(b, qe, a, xb(a));
    Jb(re, b);
  }
}
function Ce(a, b, c) {
  "focusin" === a ? (Ae(), pe = b, qe = c, pe.attachEvent("onpropertychange", Be)) : "focusout" === a && Ae();
}
function De(a) {
  if ("selectionchange" === a || "keyup" === a || "keydown" === a)
    return te(qe);
}
function Ee(a, b) {
  if ("click" === a)
    return te(b);
}
function Fe(a, b) {
  if ("input" === a || "change" === a)
    return te(b);
}
function Ge(a, b) {
  return a === b && (0 !== a || 1 / a === 1 / b) || a !== a && b !== b;
}
var He = "function" === typeof Object.is ? Object.is : Ge;
function Ie(a, b) {
  if (He(a, b))
    return true;
  if ("object" !== typeof a || null === a || "object" !== typeof b || null === b)
    return false;
  var c = Object.keys(a), d = Object.keys(b);
  if (c.length !== d.length)
    return false;
  for (d = 0; d < c.length; d++) {
    var e = c[d];
    if (!ja.call(b, e) || !He(a[e], b[e]))
      return false;
  }
  return true;
}
function Je(a) {
  for (; a && a.firstChild; )
    a = a.firstChild;
  return a;
}
function Ke(a, b) {
  var c = Je(a);
  a = 0;
  for (var d; c; ) {
    if (3 === c.nodeType) {
      d = a + c.textContent.length;
      if (a <= b && d >= b)
        return { node: c, offset: b - a };
      a = d;
    }
    a: {
      for (; c; ) {
        if (c.nextSibling) {
          c = c.nextSibling;
          break a;
        }
        c = c.parentNode;
      }
      c = void 0;
    }
    c = Je(c);
  }
}
function Le(a, b) {
  return a && b ? a === b ? true : a && 3 === a.nodeType ? false : b && 3 === b.nodeType ? Le(a, b.parentNode) : "contains" in a ? a.contains(b) : a.compareDocumentPosition ? !!(a.compareDocumentPosition(b) & 16) : false : false;
}
function Me() {
  for (var a = window, b = Xa(); b instanceof a.HTMLIFrameElement; ) {
    try {
      var c = "string" === typeof b.contentWindow.location.href;
    } catch (d) {
      c = false;
    }
    if (c)
      a = b.contentWindow;
    else
      break;
    b = Xa(a.document);
  }
  return b;
}
function Ne(a) {
  var b = a && a.nodeName && a.nodeName.toLowerCase();
  return b && ("input" === b && ("text" === a.type || "search" === a.type || "tel" === a.type || "url" === a.type || "password" === a.type) || "textarea" === b || "true" === a.contentEditable);
}
function Oe(a) {
  var b = Me(), c = a.focusedElem, d = a.selectionRange;
  if (b !== c && c && c.ownerDocument && Le(c.ownerDocument.documentElement, c)) {
    if (null !== d && Ne(c)) {
      if (b = d.start, a = d.end, void 0 === a && (a = b), "selectionStart" in c)
        c.selectionStart = b, c.selectionEnd = Math.min(a, c.value.length);
      else if (a = (b = c.ownerDocument || document) && b.defaultView || window, a.getSelection) {
        a = a.getSelection();
        var e = c.textContent.length, f2 = Math.min(d.start, e);
        d = void 0 === d.end ? f2 : Math.min(d.end, e);
        !a.extend && f2 > d && (e = d, d = f2, f2 = e);
        e = Ke(c, f2);
        var g = Ke(
          c,
          d
        );
        e && g && (1 !== a.rangeCount || a.anchorNode !== e.node || a.anchorOffset !== e.offset || a.focusNode !== g.node || a.focusOffset !== g.offset) && (b = b.createRange(), b.setStart(e.node, e.offset), a.removeAllRanges(), f2 > d ? (a.addRange(b), a.extend(g.node, g.offset)) : (b.setEnd(g.node, g.offset), a.addRange(b)));
      }
    }
    b = [];
    for (a = c; a = a.parentNode; )
      1 === a.nodeType && b.push({ element: a, left: a.scrollLeft, top: a.scrollTop });
    "function" === typeof c.focus && c.focus();
    for (c = 0; c < b.length; c++)
      a = b[c], a.element.scrollLeft = a.left, a.element.scrollTop = a.top;
  }
}
var Pe = ia && "documentMode" in document && 11 >= document.documentMode, Qe = null, Re = null, Se = null, Te = false;
function Ue(a, b, c) {
  var d = c.window === c ? c.document : 9 === c.nodeType ? c : c.ownerDocument;
  Te || null == Qe || Qe !== Xa(d) || (d = Qe, "selectionStart" in d && Ne(d) ? d = { start: d.selectionStart, end: d.selectionEnd } : (d = (d.ownerDocument && d.ownerDocument.defaultView || window).getSelection(), d = { anchorNode: d.anchorNode, anchorOffset: d.anchorOffset, focusNode: d.focusNode, focusOffset: d.focusOffset }), Se && Ie(Se, d) || (Se = d, d = oe(Re, "onSelect"), 0 < d.length && (b = new td("onSelect", "select", null, b, c), a.push({ event: b, listeners: d }), b.target = Qe)));
}
function Ve(a, b) {
  var c = {};
  c[a.toLowerCase()] = b.toLowerCase();
  c["Webkit" + a] = "webkit" + b;
  c["Moz" + a] = "moz" + b;
  return c;
}
var We = { animationend: Ve("Animation", "AnimationEnd"), animationiteration: Ve("Animation", "AnimationIteration"), animationstart: Ve("Animation", "AnimationStart"), transitionend: Ve("Transition", "TransitionEnd") }, Xe = {}, Ye = {};
ia && (Ye = document.createElement("div").style, "AnimationEvent" in window || (delete We.animationend.animation, delete We.animationiteration.animation, delete We.animationstart.animation), "TransitionEvent" in window || delete We.transitionend.transition);
function Ze(a) {
  if (Xe[a])
    return Xe[a];
  if (!We[a])
    return a;
  var b = We[a], c;
  for (c in b)
    if (b.hasOwnProperty(c) && c in Ye)
      return Xe[a] = b[c];
  return a;
}
var $e = Ze("animationend"), af = Ze("animationiteration"), bf = Ze("animationstart"), cf = Ze("transitionend"), df = /* @__PURE__ */ new Map(), ef = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
function ff(a, b) {
  df.set(a, b);
  fa(b, [a]);
}
for (var gf = 0; gf < ef.length; gf++) {
  var hf = ef[gf], jf = hf.toLowerCase(), kf = hf[0].toUpperCase() + hf.slice(1);
  ff(jf, "on" + kf);
}
ff($e, "onAnimationEnd");
ff(af, "onAnimationIteration");
ff(bf, "onAnimationStart");
ff("dblclick", "onDoubleClick");
ff("focusin", "onFocus");
ff("focusout", "onBlur");
ff(cf, "onTransitionEnd");
ha("onMouseEnter", ["mouseout", "mouseover"]);
ha("onMouseLeave", ["mouseout", "mouseover"]);
ha("onPointerEnter", ["pointerout", "pointerover"]);
ha("onPointerLeave", ["pointerout", "pointerover"]);
fa("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
fa("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
fa("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
fa("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
fa("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
fa("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
var lf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), mf = new Set("cancel close invalid load scroll toggle".split(" ").concat(lf));
function nf(a, b, c) {
  var d = a.type || "unknown-event";
  a.currentTarget = c;
  Ub(d, b, void 0, a);
  a.currentTarget = null;
}
function se(a, b) {
  b = 0 !== (b & 4);
  for (var c = 0; c < a.length; c++) {
    var d = a[c], e = d.event;
    d = d.listeners;
    a: {
      var f2 = void 0;
      if (b)
        for (var g = d.length - 1; 0 <= g; g--) {
          var h = d[g], k2 = h.instance, l2 = h.currentTarget;
          h = h.listener;
          if (k2 !== f2 && e.isPropagationStopped())
            break a;
          nf(e, h, l2);
          f2 = k2;
        }
      else
        for (g = 0; g < d.length; g++) {
          h = d[g];
          k2 = h.instance;
          l2 = h.currentTarget;
          h = h.listener;
          if (k2 !== f2 && e.isPropagationStopped())
            break a;
          nf(e, h, l2);
          f2 = k2;
        }
    }
  }
  if (Qb)
    throw a = Rb, Qb = false, Rb = null, a;
}
function D(a, b) {
  var c = b[of];
  void 0 === c && (c = b[of] = /* @__PURE__ */ new Set());
  var d = a + "__bubble";
  c.has(d) || (pf(b, a, 2, false), c.add(d));
}
function qf(a, b, c) {
  var d = 0;
  b && (d |= 4);
  pf(c, a, d, b);
}
var rf = "_reactListening" + Math.random().toString(36).slice(2);
function sf(a) {
  if (!a[rf]) {
    a[rf] = true;
    da.forEach(function(b2) {
      "selectionchange" !== b2 && (mf.has(b2) || qf(b2, false, a), qf(b2, true, a));
    });
    var b = 9 === a.nodeType ? a : a.ownerDocument;
    null === b || b[rf] || (b[rf] = true, qf("selectionchange", false, b));
  }
}
function pf(a, b, c, d) {
  switch (jd(b)) {
    case 1:
      var e = ed;
      break;
    case 4:
      e = gd;
      break;
    default:
      e = fd;
  }
  c = e.bind(null, b, c, a);
  e = void 0;
  !Lb || "touchstart" !== b && "touchmove" !== b && "wheel" !== b || (e = true);
  d ? void 0 !== e ? a.addEventListener(b, c, { capture: true, passive: e }) : a.addEventListener(b, c, true) : void 0 !== e ? a.addEventListener(b, c, { passive: e }) : a.addEventListener(b, c, false);
}
function hd(a, b, c, d, e) {
  var f2 = d;
  if (0 === (b & 1) && 0 === (b & 2) && null !== d)
    a:
      for (; ; ) {
        if (null === d)
          return;
        var g = d.tag;
        if (3 === g || 4 === g) {
          var h = d.stateNode.containerInfo;
          if (h === e || 8 === h.nodeType && h.parentNode === e)
            break;
          if (4 === g)
            for (g = d.return; null !== g; ) {
              var k2 = g.tag;
              if (3 === k2 || 4 === k2) {
                if (k2 = g.stateNode.containerInfo, k2 === e || 8 === k2.nodeType && k2.parentNode === e)
                  return;
              }
              g = g.return;
            }
          for (; null !== h; ) {
            g = Wc(h);
            if (null === g)
              return;
            k2 = g.tag;
            if (5 === k2 || 6 === k2) {
              d = f2 = g;
              continue a;
            }
            h = h.parentNode;
          }
        }
        d = d.return;
      }
  Jb(function() {
    var d2 = f2, e2 = xb(c), g2 = [];
    a: {
      var h2 = df.get(a);
      if (void 0 !== h2) {
        var k3 = td, n2 = a;
        switch (a) {
          case "keypress":
            if (0 === od(c))
              break a;
          case "keydown":
          case "keyup":
            k3 = Rd;
            break;
          case "focusin":
            n2 = "focus";
            k3 = Fd;
            break;
          case "focusout":
            n2 = "blur";
            k3 = Fd;
            break;
          case "beforeblur":
          case "afterblur":
            k3 = Fd;
            break;
          case "click":
            if (2 === c.button)
              break a;
          case "auxclick":
          case "dblclick":
          case "mousedown":
          case "mousemove":
          case "mouseup":
          case "mouseout":
          case "mouseover":
          case "contextmenu":
            k3 = Bd;
            break;
          case "drag":
          case "dragend":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "dragstart":
          case "drop":
            k3 = Dd;
            break;
          case "touchcancel":
          case "touchend":
          case "touchmove":
          case "touchstart":
            k3 = Vd;
            break;
          case $e:
          case af:
          case bf:
            k3 = Hd;
            break;
          case cf:
            k3 = Xd;
            break;
          case "scroll":
            k3 = vd;
            break;
          case "wheel":
            k3 = Zd;
            break;
          case "copy":
          case "cut":
          case "paste":
            k3 = Jd;
            break;
          case "gotpointercapture":
          case "lostpointercapture":
          case "pointercancel":
          case "pointerdown":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "pointerup":
            k3 = Td;
        }
        var t2 = 0 !== (b & 4), J2 = !t2 && "scroll" === a, x2 = t2 ? null !== h2 ? h2 + "Capture" : null : h2;
        t2 = [];
        for (var w2 = d2, u2; null !== w2; ) {
          u2 = w2;
          var F2 = u2.stateNode;
          5 === u2.tag && null !== F2 && (u2 = F2, null !== x2 && (F2 = Kb(w2, x2), null != F2 && t2.push(tf(w2, F2, u2))));
          if (J2)
            break;
          w2 = w2.return;
        }
        0 < t2.length && (h2 = new k3(h2, n2, null, c, e2), g2.push({ event: h2, listeners: t2 }));
      }
    }
    if (0 === (b & 7)) {
      a: {
        h2 = "mouseover" === a || "pointerover" === a;
        k3 = "mouseout" === a || "pointerout" === a;
        if (h2 && c !== wb && (n2 = c.relatedTarget || c.fromElement) && (Wc(n2) || n2[uf]))
          break a;
        if (k3 || h2) {
          h2 = e2.window === e2 ? e2 : (h2 = e2.ownerDocument) ? h2.defaultView || h2.parentWindow : window;
          if (k3) {
            if (n2 = c.relatedTarget || c.toElement, k3 = d2, n2 = n2 ? Wc(n2) : null, null !== n2 && (J2 = Vb(n2), n2 !== J2 || 5 !== n2.tag && 6 !== n2.tag))
              n2 = null;
          } else
            k3 = null, n2 = d2;
          if (k3 !== n2) {
            t2 = Bd;
            F2 = "onMouseLeave";
            x2 = "onMouseEnter";
            w2 = "mouse";
            if ("pointerout" === a || "pointerover" === a)
              t2 = Td, F2 = "onPointerLeave", x2 = "onPointerEnter", w2 = "pointer";
            J2 = null == k3 ? h2 : ue(k3);
            u2 = null == n2 ? h2 : ue(n2);
            h2 = new t2(F2, w2 + "leave", k3, c, e2);
            h2.target = J2;
            h2.relatedTarget = u2;
            F2 = null;
            Wc(e2) === d2 && (t2 = new t2(x2, w2 + "enter", n2, c, e2), t2.target = u2, t2.relatedTarget = J2, F2 = t2);
            J2 = F2;
            if (k3 && n2)
              b: {
                t2 = k3;
                x2 = n2;
                w2 = 0;
                for (u2 = t2; u2; u2 = vf(u2))
                  w2++;
                u2 = 0;
                for (F2 = x2; F2; F2 = vf(F2))
                  u2++;
                for (; 0 < w2 - u2; )
                  t2 = vf(t2), w2--;
                for (; 0 < u2 - w2; )
                  x2 = vf(x2), u2--;
                for (; w2--; ) {
                  if (t2 === x2 || null !== x2 && t2 === x2.alternate)
                    break b;
                  t2 = vf(t2);
                  x2 = vf(x2);
                }
                t2 = null;
              }
            else
              t2 = null;
            null !== k3 && wf(g2, h2, k3, t2, false);
            null !== n2 && null !== J2 && wf(g2, J2, n2, t2, true);
          }
        }
      }
      a: {
        h2 = d2 ? ue(d2) : window;
        k3 = h2.nodeName && h2.nodeName.toLowerCase();
        if ("select" === k3 || "input" === k3 && "file" === h2.type)
          var na = ve;
        else if (me(h2))
          if (we)
            na = Fe;
          else {
            na = De;
            var xa = Ce;
          }
        else
          (k3 = h2.nodeName) && "input" === k3.toLowerCase() && ("checkbox" === h2.type || "radio" === h2.type) && (na = Ee);
        if (na && (na = na(a, d2))) {
          ne(g2, na, c, e2);
          break a;
        }
        xa && xa(a, h2, d2);
        "focusout" === a && (xa = h2._wrapperState) && xa.controlled && "number" === h2.type && cb(h2, "number", h2.value);
      }
      xa = d2 ? ue(d2) : window;
      switch (a) {
        case "focusin":
          if (me(xa) || "true" === xa.contentEditable)
            Qe = xa, Re = d2, Se = null;
          break;
        case "focusout":
          Se = Re = Qe = null;
          break;
        case "mousedown":
          Te = true;
          break;
        case "contextmenu":
        case "mouseup":
        case "dragend":
          Te = false;
          Ue(g2, c, e2);
          break;
        case "selectionchange":
          if (Pe)
            break;
        case "keydown":
        case "keyup":
          Ue(g2, c, e2);
      }
      var $a;
      if (ae)
        b: {
          switch (a) {
            case "compositionstart":
              var ba = "onCompositionStart";
              break b;
            case "compositionend":
              ba = "onCompositionEnd";
              break b;
            case "compositionupdate":
              ba = "onCompositionUpdate";
              break b;
          }
          ba = void 0;
        }
      else
        ie ? ge(a, c) && (ba = "onCompositionEnd") : "keydown" === a && 229 === c.keyCode && (ba = "onCompositionStart");
      ba && (de && "ko" !== c.locale && (ie || "onCompositionStart" !== ba ? "onCompositionEnd" === ba && ie && ($a = nd()) : (kd = e2, ld = "value" in kd ? kd.value : kd.textContent, ie = true)), xa = oe(d2, ba), 0 < xa.length && (ba = new Ld(ba, a, null, c, e2), g2.push({ event: ba, listeners: xa }), $a ? ba.data = $a : ($a = he(c), null !== $a && (ba.data = $a))));
      if ($a = ce ? je(a, c) : ke(a, c))
        d2 = oe(d2, "onBeforeInput"), 0 < d2.length && (e2 = new Ld("onBeforeInput", "beforeinput", null, c, e2), g2.push({ event: e2, listeners: d2 }), e2.data = $a);
    }
    se(g2, b);
  });
}
function tf(a, b, c) {
  return { instance: a, listener: b, currentTarget: c };
}
function oe(a, b) {
  for (var c = b + "Capture", d = []; null !== a; ) {
    var e = a, f2 = e.stateNode;
    5 === e.tag && null !== f2 && (e = f2, f2 = Kb(a, c), null != f2 && d.unshift(tf(a, f2, e)), f2 = Kb(a, b), null != f2 && d.push(tf(a, f2, e)));
    a = a.return;
  }
  return d;
}
function vf(a) {
  if (null === a)
    return null;
  do
    a = a.return;
  while (a && 5 !== a.tag);
  return a ? a : null;
}
function wf(a, b, c, d, e) {
  for (var f2 = b._reactName, g = []; null !== c && c !== d; ) {
    var h = c, k2 = h.alternate, l2 = h.stateNode;
    if (null !== k2 && k2 === d)
      break;
    5 === h.tag && null !== l2 && (h = l2, e ? (k2 = Kb(c, f2), null != k2 && g.unshift(tf(c, k2, h))) : e || (k2 = Kb(c, f2), null != k2 && g.push(tf(c, k2, h))));
    c = c.return;
  }
  0 !== g.length && a.push({ event: b, listeners: g });
}
var xf = /\r\n?/g, yf = /\u0000|\uFFFD/g;
function zf(a) {
  return ("string" === typeof a ? a : "" + a).replace(xf, "\n").replace(yf, "");
}
function Af(a, b, c) {
  b = zf(b);
  if (zf(a) !== b && c)
    throw Error(p$1(425));
}
function Bf() {
}
var Cf = null, Df = null;
function Ef(a, b) {
  return "textarea" === a || "noscript" === a || "string" === typeof b.children || "number" === typeof b.children || "object" === typeof b.dangerouslySetInnerHTML && null !== b.dangerouslySetInnerHTML && null != b.dangerouslySetInnerHTML.__html;
}
var Ff = "function" === typeof setTimeout ? setTimeout : void 0, Gf = "function" === typeof clearTimeout ? clearTimeout : void 0, Hf = "function" === typeof Promise ? Promise : void 0, Jf = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof Hf ? function(a) {
  return Hf.resolve(null).then(a).catch(If);
} : Ff;
function If(a) {
  setTimeout(function() {
    throw a;
  });
}
function Kf(a, b) {
  var c = b, d = 0;
  do {
    var e = c.nextSibling;
    a.removeChild(c);
    if (e && 8 === e.nodeType)
      if (c = e.data, "/$" === c) {
        if (0 === d) {
          a.removeChild(e);
          bd(b);
          return;
        }
        d--;
      } else
        "$" !== c && "$?" !== c && "$!" !== c || d++;
    c = e;
  } while (c);
  bd(b);
}
function Lf(a) {
  for (; null != a; a = a.nextSibling) {
    var b = a.nodeType;
    if (1 === b || 3 === b)
      break;
    if (8 === b) {
      b = a.data;
      if ("$" === b || "$!" === b || "$?" === b)
        break;
      if ("/$" === b)
        return null;
    }
  }
  return a;
}
function Mf(a) {
  a = a.previousSibling;
  for (var b = 0; a; ) {
    if (8 === a.nodeType) {
      var c = a.data;
      if ("$" === c || "$!" === c || "$?" === c) {
        if (0 === b)
          return a;
        b--;
      } else
        "/$" === c && b++;
    }
    a = a.previousSibling;
  }
  return null;
}
var Nf = Math.random().toString(36).slice(2), Of = "__reactFiber$" + Nf, Pf = "__reactProps$" + Nf, uf = "__reactContainer$" + Nf, of = "__reactEvents$" + Nf, Qf = "__reactListeners$" + Nf, Rf = "__reactHandles$" + Nf;
function Wc(a) {
  var b = a[Of];
  if (b)
    return b;
  for (var c = a.parentNode; c; ) {
    if (b = c[uf] || c[Of]) {
      c = b.alternate;
      if (null !== b.child || null !== c && null !== c.child)
        for (a = Mf(a); null !== a; ) {
          if (c = a[Of])
            return c;
          a = Mf(a);
        }
      return b;
    }
    a = c;
    c = a.parentNode;
  }
  return null;
}
function Cb(a) {
  a = a[Of] || a[uf];
  return !a || 5 !== a.tag && 6 !== a.tag && 13 !== a.tag && 3 !== a.tag ? null : a;
}
function ue(a) {
  if (5 === a.tag || 6 === a.tag)
    return a.stateNode;
  throw Error(p$1(33));
}
function Db(a) {
  return a[Pf] || null;
}
var Sf = [], Tf = -1;
function Uf(a) {
  return { current: a };
}
function E(a) {
  0 > Tf || (a.current = Sf[Tf], Sf[Tf] = null, Tf--);
}
function G(a, b) {
  Tf++;
  Sf[Tf] = a.current;
  a.current = b;
}
var Vf = {}, H = Uf(Vf), Wf = Uf(false), Xf = Vf;
function Yf(a, b) {
  var c = a.type.contextTypes;
  if (!c)
    return Vf;
  var d = a.stateNode;
  if (d && d.__reactInternalMemoizedUnmaskedChildContext === b)
    return d.__reactInternalMemoizedMaskedChildContext;
  var e = {}, f2;
  for (f2 in c)
    e[f2] = b[f2];
  d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = b, a.__reactInternalMemoizedMaskedChildContext = e);
  return e;
}
function Zf(a) {
  a = a.childContextTypes;
  return null !== a && void 0 !== a;
}
function $f() {
  E(Wf);
  E(H);
}
function ag(a, b, c) {
  if (H.current !== Vf)
    throw Error(p$1(168));
  G(H, b);
  G(Wf, c);
}
function bg(a, b, c) {
  var d = a.stateNode;
  b = b.childContextTypes;
  if ("function" !== typeof d.getChildContext)
    return c;
  d = d.getChildContext();
  for (var e in d)
    if (!(e in b))
      throw Error(p$1(108, Ra(a) || "Unknown", e));
  return A({}, c, d);
}
function cg(a) {
  a = (a = a.stateNode) && a.__reactInternalMemoizedMergedChildContext || Vf;
  Xf = H.current;
  G(H, a);
  G(Wf, Wf.current);
  return true;
}
function dg(a, b, c) {
  var d = a.stateNode;
  if (!d)
    throw Error(p$1(169));
  c ? (a = bg(a, b, Xf), d.__reactInternalMemoizedMergedChildContext = a, E(Wf), E(H), G(H, a)) : E(Wf);
  G(Wf, c);
}
var eg = null, fg = false, gg = false;
function hg(a) {
  null === eg ? eg = [a] : eg.push(a);
}
function ig(a) {
  fg = true;
  hg(a);
}
function jg() {
  if (!gg && null !== eg) {
    gg = true;
    var a = 0, b = C;
    try {
      var c = eg;
      for (C = 1; a < c.length; a++) {
        var d = c[a];
        do
          d = d(true);
        while (null !== d);
      }
      eg = null;
      fg = false;
    } catch (e) {
      throw null !== eg && (eg = eg.slice(a + 1)), ac(fc, jg), e;
    } finally {
      C = b, gg = false;
    }
  }
  return null;
}
var kg = [], lg = 0, mg = null, ng = 0, og = [], pg = 0, qg = null, rg = 1, sg = "";
function tg(a, b) {
  kg[lg++] = ng;
  kg[lg++] = mg;
  mg = a;
  ng = b;
}
function ug(a, b, c) {
  og[pg++] = rg;
  og[pg++] = sg;
  og[pg++] = qg;
  qg = a;
  var d = rg;
  a = sg;
  var e = 32 - oc(d) - 1;
  d &= ~(1 << e);
  c += 1;
  var f2 = 32 - oc(b) + e;
  if (30 < f2) {
    var g = e - e % 5;
    f2 = (d & (1 << g) - 1).toString(32);
    d >>= g;
    e -= g;
    rg = 1 << 32 - oc(b) + e | c << e | d;
    sg = f2 + a;
  } else
    rg = 1 << f2 | c << e | d, sg = a;
}
function vg(a) {
  null !== a.return && (tg(a, 1), ug(a, 1, 0));
}
function wg(a) {
  for (; a === mg; )
    mg = kg[--lg], kg[lg] = null, ng = kg[--lg], kg[lg] = null;
  for (; a === qg; )
    qg = og[--pg], og[pg] = null, sg = og[--pg], og[pg] = null, rg = og[--pg], og[pg] = null;
}
var xg = null, yg = null, I = false, zg = null;
function Ag(a, b) {
  var c = Bg(5, null, null, 0);
  c.elementType = "DELETED";
  c.stateNode = b;
  c.return = a;
  b = a.deletions;
  null === b ? (a.deletions = [c], a.flags |= 16) : b.push(c);
}
function Cg(a, b) {
  switch (a.tag) {
    case 5:
      var c = a.type;
      b = 1 !== b.nodeType || c.toLowerCase() !== b.nodeName.toLowerCase() ? null : b;
      return null !== b ? (a.stateNode = b, xg = a, yg = Lf(b.firstChild), true) : false;
    case 6:
      return b = "" === a.pendingProps || 3 !== b.nodeType ? null : b, null !== b ? (a.stateNode = b, xg = a, yg = null, true) : false;
    case 13:
      return b = 8 !== b.nodeType ? null : b, null !== b ? (c = null !== qg ? { id: rg, overflow: sg } : null, a.memoizedState = { dehydrated: b, treeContext: c, retryLane: 1073741824 }, c = Bg(18, null, null, 0), c.stateNode = b, c.return = a, a.child = c, xg = a, yg = null, true) : false;
    default:
      return false;
  }
}
function Dg(a) {
  return 0 !== (a.mode & 1) && 0 === (a.flags & 128);
}
function Eg(a) {
  if (I) {
    var b = yg;
    if (b) {
      var c = b;
      if (!Cg(a, b)) {
        if (Dg(a))
          throw Error(p$1(418));
        b = Lf(c.nextSibling);
        var d = xg;
        b && Cg(a, b) ? Ag(d, c) : (a.flags = a.flags & -4097 | 2, I = false, xg = a);
      }
    } else {
      if (Dg(a))
        throw Error(p$1(418));
      a.flags = a.flags & -4097 | 2;
      I = false;
      xg = a;
    }
  }
}
function Fg(a) {
  for (a = a.return; null !== a && 5 !== a.tag && 3 !== a.tag && 13 !== a.tag; )
    a = a.return;
  xg = a;
}
function Gg(a) {
  if (a !== xg)
    return false;
  if (!I)
    return Fg(a), I = true, false;
  var b;
  (b = 3 !== a.tag) && !(b = 5 !== a.tag) && (b = a.type, b = "head" !== b && "body" !== b && !Ef(a.type, a.memoizedProps));
  if (b && (b = yg)) {
    if (Dg(a))
      throw Hg(), Error(p$1(418));
    for (; b; )
      Ag(a, b), b = Lf(b.nextSibling);
  }
  Fg(a);
  if (13 === a.tag) {
    a = a.memoizedState;
    a = null !== a ? a.dehydrated : null;
    if (!a)
      throw Error(p$1(317));
    a: {
      a = a.nextSibling;
      for (b = 0; a; ) {
        if (8 === a.nodeType) {
          var c = a.data;
          if ("/$" === c) {
            if (0 === b) {
              yg = Lf(a.nextSibling);
              break a;
            }
            b--;
          } else
            "$" !== c && "$!" !== c && "$?" !== c || b++;
        }
        a = a.nextSibling;
      }
      yg = null;
    }
  } else
    yg = xg ? Lf(a.stateNode.nextSibling) : null;
  return true;
}
function Hg() {
  for (var a = yg; a; )
    a = Lf(a.nextSibling);
}
function Ig() {
  yg = xg = null;
  I = false;
}
function Jg(a) {
  null === zg ? zg = [a] : zg.push(a);
}
var Kg = ua.ReactCurrentBatchConfig;
function Lg(a, b, c) {
  a = c.ref;
  if (null !== a && "function" !== typeof a && "object" !== typeof a) {
    if (c._owner) {
      c = c._owner;
      if (c) {
        if (1 !== c.tag)
          throw Error(p$1(309));
        var d = c.stateNode;
      }
      if (!d)
        throw Error(p$1(147, a));
      var e = d, f2 = "" + a;
      if (null !== b && null !== b.ref && "function" === typeof b.ref && b.ref._stringRef === f2)
        return b.ref;
      b = function(a2) {
        var b2 = e.refs;
        null === a2 ? delete b2[f2] : b2[f2] = a2;
      };
      b._stringRef = f2;
      return b;
    }
    if ("string" !== typeof a)
      throw Error(p$1(284));
    if (!c._owner)
      throw Error(p$1(290, a));
  }
  return a;
}
function Mg(a, b) {
  a = Object.prototype.toString.call(b);
  throw Error(p$1(31, "[object Object]" === a ? "object with keys {" + Object.keys(b).join(", ") + "}" : a));
}
function Ng(a) {
  var b = a._init;
  return b(a._payload);
}
function Og(a) {
  function b(b2, c2) {
    if (a) {
      var d2 = b2.deletions;
      null === d2 ? (b2.deletions = [c2], b2.flags |= 16) : d2.push(c2);
    }
  }
  function c(c2, d2) {
    if (!a)
      return null;
    for (; null !== d2; )
      b(c2, d2), d2 = d2.sibling;
    return null;
  }
  function d(a2, b2) {
    for (a2 = /* @__PURE__ */ new Map(); null !== b2; )
      null !== b2.key ? a2.set(b2.key, b2) : a2.set(b2.index, b2), b2 = b2.sibling;
    return a2;
  }
  function e(a2, b2) {
    a2 = Pg(a2, b2);
    a2.index = 0;
    a2.sibling = null;
    return a2;
  }
  function f2(b2, c2, d2) {
    b2.index = d2;
    if (!a)
      return b2.flags |= 1048576, c2;
    d2 = b2.alternate;
    if (null !== d2)
      return d2 = d2.index, d2 < c2 ? (b2.flags |= 2, c2) : d2;
    b2.flags |= 2;
    return c2;
  }
  function g(b2) {
    a && null === b2.alternate && (b2.flags |= 2);
    return b2;
  }
  function h(a2, b2, c2, d2) {
    if (null === b2 || 6 !== b2.tag)
      return b2 = Qg(c2, a2.mode, d2), b2.return = a2, b2;
    b2 = e(b2, c2);
    b2.return = a2;
    return b2;
  }
  function k2(a2, b2, c2, d2) {
    var f3 = c2.type;
    if (f3 === ya)
      return m2(a2, b2, c2.props.children, d2, c2.key);
    if (null !== b2 && (b2.elementType === f3 || "object" === typeof f3 && null !== f3 && f3.$$typeof === Ha && Ng(f3) === b2.type))
      return d2 = e(b2, c2.props), d2.ref = Lg(a2, b2, c2), d2.return = a2, d2;
    d2 = Rg(c2.type, c2.key, c2.props, null, a2.mode, d2);
    d2.ref = Lg(a2, b2, c2);
    d2.return = a2;
    return d2;
  }
  function l2(a2, b2, c2, d2) {
    if (null === b2 || 4 !== b2.tag || b2.stateNode.containerInfo !== c2.containerInfo || b2.stateNode.implementation !== c2.implementation)
      return b2 = Sg(c2, a2.mode, d2), b2.return = a2, b2;
    b2 = e(b2, c2.children || []);
    b2.return = a2;
    return b2;
  }
  function m2(a2, b2, c2, d2, f3) {
    if (null === b2 || 7 !== b2.tag)
      return b2 = Tg(c2, a2.mode, d2, f3), b2.return = a2, b2;
    b2 = e(b2, c2);
    b2.return = a2;
    return b2;
  }
  function q2(a2, b2, c2) {
    if ("string" === typeof b2 && "" !== b2 || "number" === typeof b2)
      return b2 = Qg("" + b2, a2.mode, c2), b2.return = a2, b2;
    if ("object" === typeof b2 && null !== b2) {
      switch (b2.$$typeof) {
        case va:
          return c2 = Rg(b2.type, b2.key, b2.props, null, a2.mode, c2), c2.ref = Lg(a2, null, b2), c2.return = a2, c2;
        case wa:
          return b2 = Sg(b2, a2.mode, c2), b2.return = a2, b2;
        case Ha:
          var d2 = b2._init;
          return q2(a2, d2(b2._payload), c2);
      }
      if (eb(b2) || Ka(b2))
        return b2 = Tg(b2, a2.mode, c2, null), b2.return = a2, b2;
      Mg(a2, b2);
    }
    return null;
  }
  function r2(a2, b2, c2, d2) {
    var e2 = null !== b2 ? b2.key : null;
    if ("string" === typeof c2 && "" !== c2 || "number" === typeof c2)
      return null !== e2 ? null : h(a2, b2, "" + c2, d2);
    if ("object" === typeof c2 && null !== c2) {
      switch (c2.$$typeof) {
        case va:
          return c2.key === e2 ? k2(a2, b2, c2, d2) : null;
        case wa:
          return c2.key === e2 ? l2(a2, b2, c2, d2) : null;
        case Ha:
          return e2 = c2._init, r2(
            a2,
            b2,
            e2(c2._payload),
            d2
          );
      }
      if (eb(c2) || Ka(c2))
        return null !== e2 ? null : m2(a2, b2, c2, d2, null);
      Mg(a2, c2);
    }
    return null;
  }
  function y2(a2, b2, c2, d2, e2) {
    if ("string" === typeof d2 && "" !== d2 || "number" === typeof d2)
      return a2 = a2.get(c2) || null, h(b2, a2, "" + d2, e2);
    if ("object" === typeof d2 && null !== d2) {
      switch (d2.$$typeof) {
        case va:
          return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, k2(b2, a2, d2, e2);
        case wa:
          return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, l2(b2, a2, d2, e2);
        case Ha:
          var f3 = d2._init;
          return y2(a2, b2, c2, f3(d2._payload), e2);
      }
      if (eb(d2) || Ka(d2))
        return a2 = a2.get(c2) || null, m2(b2, a2, d2, e2, null);
      Mg(b2, d2);
    }
    return null;
  }
  function n2(e2, g2, h2, k3) {
    for (var l3 = null, m3 = null, u2 = g2, w2 = g2 = 0, x2 = null; null !== u2 && w2 < h2.length; w2++) {
      u2.index > w2 ? (x2 = u2, u2 = null) : x2 = u2.sibling;
      var n3 = r2(e2, u2, h2[w2], k3);
      if (null === n3) {
        null === u2 && (u2 = x2);
        break;
      }
      a && u2 && null === n3.alternate && b(e2, u2);
      g2 = f2(n3, g2, w2);
      null === m3 ? l3 = n3 : m3.sibling = n3;
      m3 = n3;
      u2 = x2;
    }
    if (w2 === h2.length)
      return c(e2, u2), I && tg(e2, w2), l3;
    if (null === u2) {
      for (; w2 < h2.length; w2++)
        u2 = q2(e2, h2[w2], k3), null !== u2 && (g2 = f2(u2, g2, w2), null === m3 ? l3 = u2 : m3.sibling = u2, m3 = u2);
      I && tg(e2, w2);
      return l3;
    }
    for (u2 = d(e2, u2); w2 < h2.length; w2++)
      x2 = y2(u2, e2, w2, h2[w2], k3), null !== x2 && (a && null !== x2.alternate && u2.delete(null === x2.key ? w2 : x2.key), g2 = f2(x2, g2, w2), null === m3 ? l3 = x2 : m3.sibling = x2, m3 = x2);
    a && u2.forEach(function(a2) {
      return b(e2, a2);
    });
    I && tg(e2, w2);
    return l3;
  }
  function t2(e2, g2, h2, k3) {
    var l3 = Ka(h2);
    if ("function" !== typeof l3)
      throw Error(p$1(150));
    h2 = l3.call(h2);
    if (null == h2)
      throw Error(p$1(151));
    for (var u2 = l3 = null, m3 = g2, w2 = g2 = 0, x2 = null, n3 = h2.next(); null !== m3 && !n3.done; w2++, n3 = h2.next()) {
      m3.index > w2 ? (x2 = m3, m3 = null) : x2 = m3.sibling;
      var t3 = r2(e2, m3, n3.value, k3);
      if (null === t3) {
        null === m3 && (m3 = x2);
        break;
      }
      a && m3 && null === t3.alternate && b(e2, m3);
      g2 = f2(t3, g2, w2);
      null === u2 ? l3 = t3 : u2.sibling = t3;
      u2 = t3;
      m3 = x2;
    }
    if (n3.done)
      return c(
        e2,
        m3
      ), I && tg(e2, w2), l3;
    if (null === m3) {
      for (; !n3.done; w2++, n3 = h2.next())
        n3 = q2(e2, n3.value, k3), null !== n3 && (g2 = f2(n3, g2, w2), null === u2 ? l3 = n3 : u2.sibling = n3, u2 = n3);
      I && tg(e2, w2);
      return l3;
    }
    for (m3 = d(e2, m3); !n3.done; w2++, n3 = h2.next())
      n3 = y2(m3, e2, w2, n3.value, k3), null !== n3 && (a && null !== n3.alternate && m3.delete(null === n3.key ? w2 : n3.key), g2 = f2(n3, g2, w2), null === u2 ? l3 = n3 : u2.sibling = n3, u2 = n3);
    a && m3.forEach(function(a2) {
      return b(e2, a2);
    });
    I && tg(e2, w2);
    return l3;
  }
  function J2(a2, d2, f3, h2) {
    "object" === typeof f3 && null !== f3 && f3.type === ya && null === f3.key && (f3 = f3.props.children);
    if ("object" === typeof f3 && null !== f3) {
      switch (f3.$$typeof) {
        case va:
          a: {
            for (var k3 = f3.key, l3 = d2; null !== l3; ) {
              if (l3.key === k3) {
                k3 = f3.type;
                if (k3 === ya) {
                  if (7 === l3.tag) {
                    c(a2, l3.sibling);
                    d2 = e(l3, f3.props.children);
                    d2.return = a2;
                    a2 = d2;
                    break a;
                  }
                } else if (l3.elementType === k3 || "object" === typeof k3 && null !== k3 && k3.$$typeof === Ha && Ng(k3) === l3.type) {
                  c(a2, l3.sibling);
                  d2 = e(l3, f3.props);
                  d2.ref = Lg(a2, l3, f3);
                  d2.return = a2;
                  a2 = d2;
                  break a;
                }
                c(a2, l3);
                break;
              } else
                b(a2, l3);
              l3 = l3.sibling;
            }
            f3.type === ya ? (d2 = Tg(f3.props.children, a2.mode, h2, f3.key), d2.return = a2, a2 = d2) : (h2 = Rg(f3.type, f3.key, f3.props, null, a2.mode, h2), h2.ref = Lg(a2, d2, f3), h2.return = a2, a2 = h2);
          }
          return g(a2);
        case wa:
          a: {
            for (l3 = f3.key; null !== d2; ) {
              if (d2.key === l3)
                if (4 === d2.tag && d2.stateNode.containerInfo === f3.containerInfo && d2.stateNode.implementation === f3.implementation) {
                  c(a2, d2.sibling);
                  d2 = e(d2, f3.children || []);
                  d2.return = a2;
                  a2 = d2;
                  break a;
                } else {
                  c(a2, d2);
                  break;
                }
              else
                b(a2, d2);
              d2 = d2.sibling;
            }
            d2 = Sg(f3, a2.mode, h2);
            d2.return = a2;
            a2 = d2;
          }
          return g(a2);
        case Ha:
          return l3 = f3._init, J2(a2, d2, l3(f3._payload), h2);
      }
      if (eb(f3))
        return n2(a2, d2, f3, h2);
      if (Ka(f3))
        return t2(a2, d2, f3, h2);
      Mg(a2, f3);
    }
    return "string" === typeof f3 && "" !== f3 || "number" === typeof f3 ? (f3 = "" + f3, null !== d2 && 6 === d2.tag ? (c(a2, d2.sibling), d2 = e(d2, f3), d2.return = a2, a2 = d2) : (c(a2, d2), d2 = Qg(f3, a2.mode, h2), d2.return = a2, a2 = d2), g(a2)) : c(a2, d2);
  }
  return J2;
}
var Ug = Og(true), Vg = Og(false), Wg = Uf(null), Xg = null, Yg = null, Zg = null;
function $g() {
  Zg = Yg = Xg = null;
}
function ah(a) {
  var b = Wg.current;
  E(Wg);
  a._currentValue = b;
}
function bh(a, b, c) {
  for (; null !== a; ) {
    var d = a.alternate;
    (a.childLanes & b) !== b ? (a.childLanes |= b, null !== d && (d.childLanes |= b)) : null !== d && (d.childLanes & b) !== b && (d.childLanes |= b);
    if (a === c)
      break;
    a = a.return;
  }
}
function ch(a, b) {
  Xg = a;
  Zg = Yg = null;
  a = a.dependencies;
  null !== a && null !== a.firstContext && (0 !== (a.lanes & b) && (dh = true), a.firstContext = null);
}
function eh(a) {
  var b = a._currentValue;
  if (Zg !== a)
    if (a = { context: a, memoizedValue: b, next: null }, null === Yg) {
      if (null === Xg)
        throw Error(p$1(308));
      Yg = a;
      Xg.dependencies = { lanes: 0, firstContext: a };
    } else
      Yg = Yg.next = a;
  return b;
}
var fh = null;
function gh(a) {
  null === fh ? fh = [a] : fh.push(a);
}
function hh(a, b, c, d) {
  var e = b.interleaved;
  null === e ? (c.next = c, gh(b)) : (c.next = e.next, e.next = c);
  b.interleaved = c;
  return ih(a, d);
}
function ih(a, b) {
  a.lanes |= b;
  var c = a.alternate;
  null !== c && (c.lanes |= b);
  c = a;
  for (a = a.return; null !== a; )
    a.childLanes |= b, c = a.alternate, null !== c && (c.childLanes |= b), c = a, a = a.return;
  return 3 === c.tag ? c.stateNode : null;
}
var jh = false;
function kh(a) {
  a.updateQueue = { baseState: a.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
}
function lh(a, b) {
  a = a.updateQueue;
  b.updateQueue === a && (b.updateQueue = { baseState: a.baseState, firstBaseUpdate: a.firstBaseUpdate, lastBaseUpdate: a.lastBaseUpdate, shared: a.shared, effects: a.effects });
}
function mh(a, b) {
  return { eventTime: a, lane: b, tag: 0, payload: null, callback: null, next: null };
}
function nh(a, b, c) {
  var d = a.updateQueue;
  if (null === d)
    return null;
  d = d.shared;
  if (0 !== (K & 2)) {
    var e = d.pending;
    null === e ? b.next = b : (b.next = e.next, e.next = b);
    d.pending = b;
    return ih(a, c);
  }
  e = d.interleaved;
  null === e ? (b.next = b, gh(d)) : (b.next = e.next, e.next = b);
  d.interleaved = b;
  return ih(a, c);
}
function oh(a, b, c) {
  b = b.updateQueue;
  if (null !== b && (b = b.shared, 0 !== (c & 4194240))) {
    var d = b.lanes;
    d &= a.pendingLanes;
    c |= d;
    b.lanes = c;
    Cc(a, c);
  }
}
function ph(a, b) {
  var c = a.updateQueue, d = a.alternate;
  if (null !== d && (d = d.updateQueue, c === d)) {
    var e = null, f2 = null;
    c = c.firstBaseUpdate;
    if (null !== c) {
      do {
        var g = { eventTime: c.eventTime, lane: c.lane, tag: c.tag, payload: c.payload, callback: c.callback, next: null };
        null === f2 ? e = f2 = g : f2 = f2.next = g;
        c = c.next;
      } while (null !== c);
      null === f2 ? e = f2 = b : f2 = f2.next = b;
    } else
      e = f2 = b;
    c = { baseState: d.baseState, firstBaseUpdate: e, lastBaseUpdate: f2, shared: d.shared, effects: d.effects };
    a.updateQueue = c;
    return;
  }
  a = c.lastBaseUpdate;
  null === a ? c.firstBaseUpdate = b : a.next = b;
  c.lastBaseUpdate = b;
}
function qh(a, b, c, d) {
  var e = a.updateQueue;
  jh = false;
  var f2 = e.firstBaseUpdate, g = e.lastBaseUpdate, h = e.shared.pending;
  if (null !== h) {
    e.shared.pending = null;
    var k2 = h, l2 = k2.next;
    k2.next = null;
    null === g ? f2 = l2 : g.next = l2;
    g = k2;
    var m2 = a.alternate;
    null !== m2 && (m2 = m2.updateQueue, h = m2.lastBaseUpdate, h !== g && (null === h ? m2.firstBaseUpdate = l2 : h.next = l2, m2.lastBaseUpdate = k2));
  }
  if (null !== f2) {
    var q2 = e.baseState;
    g = 0;
    m2 = l2 = k2 = null;
    h = f2;
    do {
      var r2 = h.lane, y2 = h.eventTime;
      if ((d & r2) === r2) {
        null !== m2 && (m2 = m2.next = {
          eventTime: y2,
          lane: 0,
          tag: h.tag,
          payload: h.payload,
          callback: h.callback,
          next: null
        });
        a: {
          var n2 = a, t2 = h;
          r2 = b;
          y2 = c;
          switch (t2.tag) {
            case 1:
              n2 = t2.payload;
              if ("function" === typeof n2) {
                q2 = n2.call(y2, q2, r2);
                break a;
              }
              q2 = n2;
              break a;
            case 3:
              n2.flags = n2.flags & -65537 | 128;
            case 0:
              n2 = t2.payload;
              r2 = "function" === typeof n2 ? n2.call(y2, q2, r2) : n2;
              if (null === r2 || void 0 === r2)
                break a;
              q2 = A({}, q2, r2);
              break a;
            case 2:
              jh = true;
          }
        }
        null !== h.callback && 0 !== h.lane && (a.flags |= 64, r2 = e.effects, null === r2 ? e.effects = [h] : r2.push(h));
      } else
        y2 = { eventTime: y2, lane: r2, tag: h.tag, payload: h.payload, callback: h.callback, next: null }, null === m2 ? (l2 = m2 = y2, k2 = q2) : m2 = m2.next = y2, g |= r2;
      h = h.next;
      if (null === h)
        if (h = e.shared.pending, null === h)
          break;
        else
          r2 = h, h = r2.next, r2.next = null, e.lastBaseUpdate = r2, e.shared.pending = null;
    } while (1);
    null === m2 && (k2 = q2);
    e.baseState = k2;
    e.firstBaseUpdate = l2;
    e.lastBaseUpdate = m2;
    b = e.shared.interleaved;
    if (null !== b) {
      e = b;
      do
        g |= e.lane, e = e.next;
      while (e !== b);
    } else
      null === f2 && (e.shared.lanes = 0);
    rh |= g;
    a.lanes = g;
    a.memoizedState = q2;
  }
}
function sh(a, b, c) {
  a = b.effects;
  b.effects = null;
  if (null !== a)
    for (b = 0; b < a.length; b++) {
      var d = a[b], e = d.callback;
      if (null !== e) {
        d.callback = null;
        d = c;
        if ("function" !== typeof e)
          throw Error(p$1(191, e));
        e.call(d);
      }
    }
}
var th = {}, uh = Uf(th), vh = Uf(th), wh = Uf(th);
function xh(a) {
  if (a === th)
    throw Error(p$1(174));
  return a;
}
function yh(a, b) {
  G(wh, b);
  G(vh, a);
  G(uh, th);
  a = b.nodeType;
  switch (a) {
    case 9:
    case 11:
      b = (b = b.documentElement) ? b.namespaceURI : lb(null, "");
      break;
    default:
      a = 8 === a ? b.parentNode : b, b = a.namespaceURI || null, a = a.tagName, b = lb(b, a);
  }
  E(uh);
  G(uh, b);
}
function zh() {
  E(uh);
  E(vh);
  E(wh);
}
function Ah(a) {
  xh(wh.current);
  var b = xh(uh.current);
  var c = lb(b, a.type);
  b !== c && (G(vh, a), G(uh, c));
}
function Bh(a) {
  vh.current === a && (E(uh), E(vh));
}
var L = Uf(0);
function Ch(a) {
  for (var b = a; null !== b; ) {
    if (13 === b.tag) {
      var c = b.memoizedState;
      if (null !== c && (c = c.dehydrated, null === c || "$?" === c.data || "$!" === c.data))
        return b;
    } else if (19 === b.tag && void 0 !== b.memoizedProps.revealOrder) {
      if (0 !== (b.flags & 128))
        return b;
    } else if (null !== b.child) {
      b.child.return = b;
      b = b.child;
      continue;
    }
    if (b === a)
      break;
    for (; null === b.sibling; ) {
      if (null === b.return || b.return === a)
        return null;
      b = b.return;
    }
    b.sibling.return = b.return;
    b = b.sibling;
  }
  return null;
}
var Dh = [];
function Eh() {
  for (var a = 0; a < Dh.length; a++)
    Dh[a]._workInProgressVersionPrimary = null;
  Dh.length = 0;
}
var Fh = ua.ReactCurrentDispatcher, Gh = ua.ReactCurrentBatchConfig, Hh = 0, M = null, N = null, O = null, Ih = false, Jh = false, Kh = 0, Lh = 0;
function P() {
  throw Error(p$1(321));
}
function Mh(a, b) {
  if (null === b)
    return false;
  for (var c = 0; c < b.length && c < a.length; c++)
    if (!He(a[c], b[c]))
      return false;
  return true;
}
function Nh(a, b, c, d, e, f2) {
  Hh = f2;
  M = b;
  b.memoizedState = null;
  b.updateQueue = null;
  b.lanes = 0;
  Fh.current = null === a || null === a.memoizedState ? Oh : Ph;
  a = c(d, e);
  if (Jh) {
    f2 = 0;
    do {
      Jh = false;
      Kh = 0;
      if (25 <= f2)
        throw Error(p$1(301));
      f2 += 1;
      O = N = null;
      b.updateQueue = null;
      Fh.current = Qh;
      a = c(d, e);
    } while (Jh);
  }
  Fh.current = Rh;
  b = null !== N && null !== N.next;
  Hh = 0;
  O = N = M = null;
  Ih = false;
  if (b)
    throw Error(p$1(300));
  return a;
}
function Sh() {
  var a = 0 !== Kh;
  Kh = 0;
  return a;
}
function Th() {
  var a = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
  null === O ? M.memoizedState = O = a : O = O.next = a;
  return O;
}
function Uh() {
  if (null === N) {
    var a = M.alternate;
    a = null !== a ? a.memoizedState : null;
  } else
    a = N.next;
  var b = null === O ? M.memoizedState : O.next;
  if (null !== b)
    O = b, N = a;
  else {
    if (null === a)
      throw Error(p$1(310));
    N = a;
    a = { memoizedState: N.memoizedState, baseState: N.baseState, baseQueue: N.baseQueue, queue: N.queue, next: null };
    null === O ? M.memoizedState = O = a : O = O.next = a;
  }
  return O;
}
function Vh(a, b) {
  return "function" === typeof b ? b(a) : b;
}
function Wh(a) {
  var b = Uh(), c = b.queue;
  if (null === c)
    throw Error(p$1(311));
  c.lastRenderedReducer = a;
  var d = N, e = d.baseQueue, f2 = c.pending;
  if (null !== f2) {
    if (null !== e) {
      var g = e.next;
      e.next = f2.next;
      f2.next = g;
    }
    d.baseQueue = e = f2;
    c.pending = null;
  }
  if (null !== e) {
    f2 = e.next;
    d = d.baseState;
    var h = g = null, k2 = null, l2 = f2;
    do {
      var m2 = l2.lane;
      if ((Hh & m2) === m2)
        null !== k2 && (k2 = k2.next = { lane: 0, action: l2.action, hasEagerState: l2.hasEagerState, eagerState: l2.eagerState, next: null }), d = l2.hasEagerState ? l2.eagerState : a(d, l2.action);
      else {
        var q2 = {
          lane: m2,
          action: l2.action,
          hasEagerState: l2.hasEagerState,
          eagerState: l2.eagerState,
          next: null
        };
        null === k2 ? (h = k2 = q2, g = d) : k2 = k2.next = q2;
        M.lanes |= m2;
        rh |= m2;
      }
      l2 = l2.next;
    } while (null !== l2 && l2 !== f2);
    null === k2 ? g = d : k2.next = h;
    He(d, b.memoizedState) || (dh = true);
    b.memoizedState = d;
    b.baseState = g;
    b.baseQueue = k2;
    c.lastRenderedState = d;
  }
  a = c.interleaved;
  if (null !== a) {
    e = a;
    do
      f2 = e.lane, M.lanes |= f2, rh |= f2, e = e.next;
    while (e !== a);
  } else
    null === e && (c.lanes = 0);
  return [b.memoizedState, c.dispatch];
}
function Xh(a) {
  var b = Uh(), c = b.queue;
  if (null === c)
    throw Error(p$1(311));
  c.lastRenderedReducer = a;
  var d = c.dispatch, e = c.pending, f2 = b.memoizedState;
  if (null !== e) {
    c.pending = null;
    var g = e = e.next;
    do
      f2 = a(f2, g.action), g = g.next;
    while (g !== e);
    He(f2, b.memoizedState) || (dh = true);
    b.memoizedState = f2;
    null === b.baseQueue && (b.baseState = f2);
    c.lastRenderedState = f2;
  }
  return [f2, d];
}
function Yh() {
}
function Zh(a, b) {
  var c = M, d = Uh(), e = b(), f2 = !He(d.memoizedState, e);
  f2 && (d.memoizedState = e, dh = true);
  d = d.queue;
  $h(ai.bind(null, c, d, a), [a]);
  if (d.getSnapshot !== b || f2 || null !== O && O.memoizedState.tag & 1) {
    c.flags |= 2048;
    bi(9, ci.bind(null, c, d, e, b), void 0, null);
    if (null === Q)
      throw Error(p$1(349));
    0 !== (Hh & 30) || di(c, b, e);
  }
  return e;
}
function di(a, b, c) {
  a.flags |= 16384;
  a = { getSnapshot: b, value: c };
  b = M.updateQueue;
  null === b ? (b = { lastEffect: null, stores: null }, M.updateQueue = b, b.stores = [a]) : (c = b.stores, null === c ? b.stores = [a] : c.push(a));
}
function ci(a, b, c, d) {
  b.value = c;
  b.getSnapshot = d;
  ei(b) && fi(a);
}
function ai(a, b, c) {
  return c(function() {
    ei(b) && fi(a);
  });
}
function ei(a) {
  var b = a.getSnapshot;
  a = a.value;
  try {
    var c = b();
    return !He(a, c);
  } catch (d) {
    return true;
  }
}
function fi(a) {
  var b = ih(a, 1);
  null !== b && gi(b, a, 1, -1);
}
function hi(a) {
  var b = Th();
  "function" === typeof a && (a = a());
  b.memoizedState = b.baseState = a;
  a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Vh, lastRenderedState: a };
  b.queue = a;
  a = a.dispatch = ii.bind(null, M, a);
  return [b.memoizedState, a];
}
function bi(a, b, c, d) {
  a = { tag: a, create: b, destroy: c, deps: d, next: null };
  b = M.updateQueue;
  null === b ? (b = { lastEffect: null, stores: null }, M.updateQueue = b, b.lastEffect = a.next = a) : (c = b.lastEffect, null === c ? b.lastEffect = a.next = a : (d = c.next, c.next = a, a.next = d, b.lastEffect = a));
  return a;
}
function ji() {
  return Uh().memoizedState;
}
function ki(a, b, c, d) {
  var e = Th();
  M.flags |= a;
  e.memoizedState = bi(1 | b, c, void 0, void 0 === d ? null : d);
}
function li(a, b, c, d) {
  var e = Uh();
  d = void 0 === d ? null : d;
  var f2 = void 0;
  if (null !== N) {
    var g = N.memoizedState;
    f2 = g.destroy;
    if (null !== d && Mh(d, g.deps)) {
      e.memoizedState = bi(b, c, f2, d);
      return;
    }
  }
  M.flags |= a;
  e.memoizedState = bi(1 | b, c, f2, d);
}
function mi(a, b) {
  return ki(8390656, 8, a, b);
}
function $h(a, b) {
  return li(2048, 8, a, b);
}
function ni(a, b) {
  return li(4, 2, a, b);
}
function oi(a, b) {
  return li(4, 4, a, b);
}
function pi(a, b) {
  if ("function" === typeof b)
    return a = a(), b(a), function() {
      b(null);
    };
  if (null !== b && void 0 !== b)
    return a = a(), b.current = a, function() {
      b.current = null;
    };
}
function qi(a, b, c) {
  c = null !== c && void 0 !== c ? c.concat([a]) : null;
  return li(4, 4, pi.bind(null, b, a), c);
}
function ri() {
}
function si(a, b) {
  var c = Uh();
  b = void 0 === b ? null : b;
  var d = c.memoizedState;
  if (null !== d && null !== b && Mh(b, d[1]))
    return d[0];
  c.memoizedState = [a, b];
  return a;
}
function ti(a, b) {
  var c = Uh();
  b = void 0 === b ? null : b;
  var d = c.memoizedState;
  if (null !== d && null !== b && Mh(b, d[1]))
    return d[0];
  a = a();
  c.memoizedState = [a, b];
  return a;
}
function ui(a, b, c) {
  if (0 === (Hh & 21))
    return a.baseState && (a.baseState = false, dh = true), a.memoizedState = c;
  He(c, b) || (c = yc(), M.lanes |= c, rh |= c, a.baseState = true);
  return b;
}
function vi(a, b) {
  var c = C;
  C = 0 !== c && 4 > c ? c : 4;
  a(true);
  var d = Gh.transition;
  Gh.transition = {};
  try {
    a(false), b();
  } finally {
    C = c, Gh.transition = d;
  }
}
function wi() {
  return Uh().memoizedState;
}
function xi(a, b, c) {
  var d = yi(a);
  c = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
  if (zi(a))
    Ai(b, c);
  else if (c = hh(a, b, c, d), null !== c) {
    var e = R();
    gi(c, a, d, e);
    Bi(c, b, d);
  }
}
function ii(a, b, c) {
  var d = yi(a), e = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
  if (zi(a))
    Ai(b, e);
  else {
    var f2 = a.alternate;
    if (0 === a.lanes && (null === f2 || 0 === f2.lanes) && (f2 = b.lastRenderedReducer, null !== f2))
      try {
        var g = b.lastRenderedState, h = f2(g, c);
        e.hasEagerState = true;
        e.eagerState = h;
        if (He(h, g)) {
          var k2 = b.interleaved;
          null === k2 ? (e.next = e, gh(b)) : (e.next = k2.next, k2.next = e);
          b.interleaved = e;
          return;
        }
      } catch (l2) {
      } finally {
      }
    c = hh(a, b, e, d);
    null !== c && (e = R(), gi(c, a, d, e), Bi(c, b, d));
  }
}
function zi(a) {
  var b = a.alternate;
  return a === M || null !== b && b === M;
}
function Ai(a, b) {
  Jh = Ih = true;
  var c = a.pending;
  null === c ? b.next = b : (b.next = c.next, c.next = b);
  a.pending = b;
}
function Bi(a, b, c) {
  if (0 !== (c & 4194240)) {
    var d = b.lanes;
    d &= a.pendingLanes;
    c |= d;
    b.lanes = c;
    Cc(a, c);
  }
}
var Rh = { readContext: eh, useCallback: P, useContext: P, useEffect: P, useImperativeHandle: P, useInsertionEffect: P, useLayoutEffect: P, useMemo: P, useReducer: P, useRef: P, useState: P, useDebugValue: P, useDeferredValue: P, useTransition: P, useMutableSource: P, useSyncExternalStore: P, useId: P, unstable_isNewReconciler: false }, Oh = { readContext: eh, useCallback: function(a, b) {
  Th().memoizedState = [a, void 0 === b ? null : b];
  return a;
}, useContext: eh, useEffect: mi, useImperativeHandle: function(a, b, c) {
  c = null !== c && void 0 !== c ? c.concat([a]) : null;
  return ki(
    4194308,
    4,
    pi.bind(null, b, a),
    c
  );
}, useLayoutEffect: function(a, b) {
  return ki(4194308, 4, a, b);
}, useInsertionEffect: function(a, b) {
  return ki(4, 2, a, b);
}, useMemo: function(a, b) {
  var c = Th();
  b = void 0 === b ? null : b;
  a = a();
  c.memoizedState = [a, b];
  return a;
}, useReducer: function(a, b, c) {
  var d = Th();
  b = void 0 !== c ? c(b) : b;
  d.memoizedState = d.baseState = b;
  a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: a, lastRenderedState: b };
  d.queue = a;
  a = a.dispatch = xi.bind(null, M, a);
  return [d.memoizedState, a];
}, useRef: function(a) {
  var b = Th();
  a = { current: a };
  return b.memoizedState = a;
}, useState: hi, useDebugValue: ri, useDeferredValue: function(a) {
  return Th().memoizedState = a;
}, useTransition: function() {
  var a = hi(false), b = a[0];
  a = vi.bind(null, a[1]);
  Th().memoizedState = a;
  return [b, a];
}, useMutableSource: function() {
}, useSyncExternalStore: function(a, b, c) {
  var d = M, e = Th();
  if (I) {
    if (void 0 === c)
      throw Error(p$1(407));
    c = c();
  } else {
    c = b();
    if (null === Q)
      throw Error(p$1(349));
    0 !== (Hh & 30) || di(d, b, c);
  }
  e.memoizedState = c;
  var f2 = { value: c, getSnapshot: b };
  e.queue = f2;
  mi(ai.bind(
    null,
    d,
    f2,
    a
  ), [a]);
  d.flags |= 2048;
  bi(9, ci.bind(null, d, f2, c, b), void 0, null);
  return c;
}, useId: function() {
  var a = Th(), b = Q.identifierPrefix;
  if (I) {
    var c = sg;
    var d = rg;
    c = (d & ~(1 << 32 - oc(d) - 1)).toString(32) + c;
    b = ":" + b + "R" + c;
    c = Kh++;
    0 < c && (b += "H" + c.toString(32));
    b += ":";
  } else
    c = Lh++, b = ":" + b + "r" + c.toString(32) + ":";
  return a.memoizedState = b;
}, unstable_isNewReconciler: false }, Ph = {
  readContext: eh,
  useCallback: si,
  useContext: eh,
  useEffect: $h,
  useImperativeHandle: qi,
  useInsertionEffect: ni,
  useLayoutEffect: oi,
  useMemo: ti,
  useReducer: Wh,
  useRef: ji,
  useState: function() {
    return Wh(Vh);
  },
  useDebugValue: ri,
  useDeferredValue: function(a) {
    var b = Uh();
    return ui(b, N.memoizedState, a);
  },
  useTransition: function() {
    var a = Wh(Vh)[0], b = Uh().memoizedState;
    return [a, b];
  },
  useMutableSource: Yh,
  useSyncExternalStore: Zh,
  useId: wi,
  unstable_isNewReconciler: false
}, Qh = { readContext: eh, useCallback: si, useContext: eh, useEffect: $h, useImperativeHandle: qi, useInsertionEffect: ni, useLayoutEffect: oi, useMemo: ti, useReducer: Xh, useRef: ji, useState: function() {
  return Xh(Vh);
}, useDebugValue: ri, useDeferredValue: function(a) {
  var b = Uh();
  return null === N ? b.memoizedState = a : ui(b, N.memoizedState, a);
}, useTransition: function() {
  var a = Xh(Vh)[0], b = Uh().memoizedState;
  return [a, b];
}, useMutableSource: Yh, useSyncExternalStore: Zh, useId: wi, unstable_isNewReconciler: false };
function Ci(a, b) {
  if (a && a.defaultProps) {
    b = A({}, b);
    a = a.defaultProps;
    for (var c in a)
      void 0 === b[c] && (b[c] = a[c]);
    return b;
  }
  return b;
}
function Di(a, b, c, d) {
  b = a.memoizedState;
  c = c(d, b);
  c = null === c || void 0 === c ? b : A({}, b, c);
  a.memoizedState = c;
  0 === a.lanes && (a.updateQueue.baseState = c);
}
var Ei = { isMounted: function(a) {
  return (a = a._reactInternals) ? Vb(a) === a : false;
}, enqueueSetState: function(a, b, c) {
  a = a._reactInternals;
  var d = R(), e = yi(a), f2 = mh(d, e);
  f2.payload = b;
  void 0 !== c && null !== c && (f2.callback = c);
  b = nh(a, f2, e);
  null !== b && (gi(b, a, e, d), oh(b, a, e));
}, enqueueReplaceState: function(a, b, c) {
  a = a._reactInternals;
  var d = R(), e = yi(a), f2 = mh(d, e);
  f2.tag = 1;
  f2.payload = b;
  void 0 !== c && null !== c && (f2.callback = c);
  b = nh(a, f2, e);
  null !== b && (gi(b, a, e, d), oh(b, a, e));
}, enqueueForceUpdate: function(a, b) {
  a = a._reactInternals;
  var c = R(), d = yi(a), e = mh(c, d);
  e.tag = 2;
  void 0 !== b && null !== b && (e.callback = b);
  b = nh(a, e, d);
  null !== b && (gi(b, a, d, c), oh(b, a, d));
} };
function Fi(a, b, c, d, e, f2, g) {
  a = a.stateNode;
  return "function" === typeof a.shouldComponentUpdate ? a.shouldComponentUpdate(d, f2, g) : b.prototype && b.prototype.isPureReactComponent ? !Ie(c, d) || !Ie(e, f2) : true;
}
function Gi(a, b, c) {
  var d = false, e = Vf;
  var f2 = b.contextType;
  "object" === typeof f2 && null !== f2 ? f2 = eh(f2) : (e = Zf(b) ? Xf : H.current, d = b.contextTypes, f2 = (d = null !== d && void 0 !== d) ? Yf(a, e) : Vf);
  b = new b(c, f2);
  a.memoizedState = null !== b.state && void 0 !== b.state ? b.state : null;
  b.updater = Ei;
  a.stateNode = b;
  b._reactInternals = a;
  d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = e, a.__reactInternalMemoizedMaskedChildContext = f2);
  return b;
}
function Hi(a, b, c, d) {
  a = b.state;
  "function" === typeof b.componentWillReceiveProps && b.componentWillReceiveProps(c, d);
  "function" === typeof b.UNSAFE_componentWillReceiveProps && b.UNSAFE_componentWillReceiveProps(c, d);
  b.state !== a && Ei.enqueueReplaceState(b, b.state, null);
}
function Ii(a, b, c, d) {
  var e = a.stateNode;
  e.props = c;
  e.state = a.memoizedState;
  e.refs = {};
  kh(a);
  var f2 = b.contextType;
  "object" === typeof f2 && null !== f2 ? e.context = eh(f2) : (f2 = Zf(b) ? Xf : H.current, e.context = Yf(a, f2));
  e.state = a.memoizedState;
  f2 = b.getDerivedStateFromProps;
  "function" === typeof f2 && (Di(a, b, f2, c), e.state = a.memoizedState);
  "function" === typeof b.getDerivedStateFromProps || "function" === typeof e.getSnapshotBeforeUpdate || "function" !== typeof e.UNSAFE_componentWillMount && "function" !== typeof e.componentWillMount || (b = e.state, "function" === typeof e.componentWillMount && e.componentWillMount(), "function" === typeof e.UNSAFE_componentWillMount && e.UNSAFE_componentWillMount(), b !== e.state && Ei.enqueueReplaceState(e, e.state, null), qh(a, c, e, d), e.state = a.memoizedState);
  "function" === typeof e.componentDidMount && (a.flags |= 4194308);
}
function Ji(a, b) {
  try {
    var c = "", d = b;
    do
      c += Pa(d), d = d.return;
    while (d);
    var e = c;
  } catch (f2) {
    e = "\nError generating stack: " + f2.message + "\n" + f2.stack;
  }
  return { value: a, source: b, stack: e, digest: null };
}
function Ki(a, b, c) {
  return { value: a, source: null, stack: null != c ? c : null, digest: null != b ? b : null };
}
function Li(a, b) {
  try {
    console.error(b.value);
  } catch (c) {
    setTimeout(function() {
      throw c;
    });
  }
}
var Mi = "function" === typeof WeakMap ? WeakMap : Map;
function Ni(a, b, c) {
  c = mh(-1, c);
  c.tag = 3;
  c.payload = { element: null };
  var d = b.value;
  c.callback = function() {
    Oi || (Oi = true, Pi = d);
    Li(a, b);
  };
  return c;
}
function Qi(a, b, c) {
  c = mh(-1, c);
  c.tag = 3;
  var d = a.type.getDerivedStateFromError;
  if ("function" === typeof d) {
    var e = b.value;
    c.payload = function() {
      return d(e);
    };
    c.callback = function() {
      Li(a, b);
    };
  }
  var f2 = a.stateNode;
  null !== f2 && "function" === typeof f2.componentDidCatch && (c.callback = function() {
    Li(a, b);
    "function" !== typeof d && (null === Ri ? Ri = /* @__PURE__ */ new Set([this]) : Ri.add(this));
    var c2 = b.stack;
    this.componentDidCatch(b.value, { componentStack: null !== c2 ? c2 : "" });
  });
  return c;
}
function Si(a, b, c) {
  var d = a.pingCache;
  if (null === d) {
    d = a.pingCache = new Mi();
    var e = /* @__PURE__ */ new Set();
    d.set(b, e);
  } else
    e = d.get(b), void 0 === e && (e = /* @__PURE__ */ new Set(), d.set(b, e));
  e.has(c) || (e.add(c), a = Ti.bind(null, a, b, c), b.then(a, a));
}
function Ui(a) {
  do {
    var b;
    if (b = 13 === a.tag)
      b = a.memoizedState, b = null !== b ? null !== b.dehydrated ? true : false : true;
    if (b)
      return a;
    a = a.return;
  } while (null !== a);
  return null;
}
function Vi(a, b, c, d, e) {
  if (0 === (a.mode & 1))
    return a === b ? a.flags |= 65536 : (a.flags |= 128, c.flags |= 131072, c.flags &= -52805, 1 === c.tag && (null === c.alternate ? c.tag = 17 : (b = mh(-1, 1), b.tag = 2, nh(c, b, 1))), c.lanes |= 1), a;
  a.flags |= 65536;
  a.lanes = e;
  return a;
}
var Wi = ua.ReactCurrentOwner, dh = false;
function Xi(a, b, c, d) {
  b.child = null === a ? Vg(b, null, c, d) : Ug(b, a.child, c, d);
}
function Yi(a, b, c, d, e) {
  c = c.render;
  var f2 = b.ref;
  ch(b, e);
  d = Nh(a, b, c, d, f2, e);
  c = Sh();
  if (null !== a && !dh)
    return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
  I && c && vg(b);
  b.flags |= 1;
  Xi(a, b, d, e);
  return b.child;
}
function $i(a, b, c, d, e) {
  if (null === a) {
    var f2 = c.type;
    if ("function" === typeof f2 && !aj(f2) && void 0 === f2.defaultProps && null === c.compare && void 0 === c.defaultProps)
      return b.tag = 15, b.type = f2, bj(a, b, f2, d, e);
    a = Rg(c.type, null, d, b, b.mode, e);
    a.ref = b.ref;
    a.return = b;
    return b.child = a;
  }
  f2 = a.child;
  if (0 === (a.lanes & e)) {
    var g = f2.memoizedProps;
    c = c.compare;
    c = null !== c ? c : Ie;
    if (c(g, d) && a.ref === b.ref)
      return Zi(a, b, e);
  }
  b.flags |= 1;
  a = Pg(f2, d);
  a.ref = b.ref;
  a.return = b;
  return b.child = a;
}
function bj(a, b, c, d, e) {
  if (null !== a) {
    var f2 = a.memoizedProps;
    if (Ie(f2, d) && a.ref === b.ref)
      if (dh = false, b.pendingProps = d = f2, 0 !== (a.lanes & e))
        0 !== (a.flags & 131072) && (dh = true);
      else
        return b.lanes = a.lanes, Zi(a, b, e);
  }
  return cj(a, b, c, d, e);
}
function dj(a, b, c) {
  var d = b.pendingProps, e = d.children, f2 = null !== a ? a.memoizedState : null;
  if ("hidden" === d.mode)
    if (0 === (b.mode & 1))
      b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, G(ej, fj), fj |= c;
    else {
      if (0 === (c & 1073741824))
        return a = null !== f2 ? f2.baseLanes | c : c, b.lanes = b.childLanes = 1073741824, b.memoizedState = { baseLanes: a, cachePool: null, transitions: null }, b.updateQueue = null, G(ej, fj), fj |= a, null;
      b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null };
      d = null !== f2 ? f2.baseLanes : c;
      G(ej, fj);
      fj |= d;
    }
  else
    null !== f2 ? (d = f2.baseLanes | c, b.memoizedState = null) : d = c, G(ej, fj), fj |= d;
  Xi(a, b, e, c);
  return b.child;
}
function gj(a, b) {
  var c = b.ref;
  if (null === a && null !== c || null !== a && a.ref !== c)
    b.flags |= 512, b.flags |= 2097152;
}
function cj(a, b, c, d, e) {
  var f2 = Zf(c) ? Xf : H.current;
  f2 = Yf(b, f2);
  ch(b, e);
  c = Nh(a, b, c, d, f2, e);
  d = Sh();
  if (null !== a && !dh)
    return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
  I && d && vg(b);
  b.flags |= 1;
  Xi(a, b, c, e);
  return b.child;
}
function hj(a, b, c, d, e) {
  if (Zf(c)) {
    var f2 = true;
    cg(b);
  } else
    f2 = false;
  ch(b, e);
  if (null === b.stateNode)
    ij(a, b), Gi(b, c, d), Ii(b, c, d, e), d = true;
  else if (null === a) {
    var g = b.stateNode, h = b.memoizedProps;
    g.props = h;
    var k2 = g.context, l2 = c.contextType;
    "object" === typeof l2 && null !== l2 ? l2 = eh(l2) : (l2 = Zf(c) ? Xf : H.current, l2 = Yf(b, l2));
    var m2 = c.getDerivedStateFromProps, q2 = "function" === typeof m2 || "function" === typeof g.getSnapshotBeforeUpdate;
    q2 || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== d || k2 !== l2) && Hi(b, g, d, l2);
    jh = false;
    var r2 = b.memoizedState;
    g.state = r2;
    qh(b, d, g, e);
    k2 = b.memoizedState;
    h !== d || r2 !== k2 || Wf.current || jh ? ("function" === typeof m2 && (Di(b, c, m2, d), k2 = b.memoizedState), (h = jh || Fi(b, c, h, d, r2, k2, l2)) ? (q2 || "function" !== typeof g.UNSAFE_componentWillMount && "function" !== typeof g.componentWillMount || ("function" === typeof g.componentWillMount && g.componentWillMount(), "function" === typeof g.UNSAFE_componentWillMount && g.UNSAFE_componentWillMount()), "function" === typeof g.componentDidMount && (b.flags |= 4194308)) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), b.memoizedProps = d, b.memoizedState = k2), g.props = d, g.state = k2, g.context = l2, d = h) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), d = false);
  } else {
    g = b.stateNode;
    lh(a, b);
    h = b.memoizedProps;
    l2 = b.type === b.elementType ? h : Ci(b.type, h);
    g.props = l2;
    q2 = b.pendingProps;
    r2 = g.context;
    k2 = c.contextType;
    "object" === typeof k2 && null !== k2 ? k2 = eh(k2) : (k2 = Zf(c) ? Xf : H.current, k2 = Yf(b, k2));
    var y2 = c.getDerivedStateFromProps;
    (m2 = "function" === typeof y2 || "function" === typeof g.getSnapshotBeforeUpdate) || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== q2 || r2 !== k2) && Hi(b, g, d, k2);
    jh = false;
    r2 = b.memoizedState;
    g.state = r2;
    qh(b, d, g, e);
    var n2 = b.memoizedState;
    h !== q2 || r2 !== n2 || Wf.current || jh ? ("function" === typeof y2 && (Di(b, c, y2, d), n2 = b.memoizedState), (l2 = jh || Fi(b, c, l2, d, r2, n2, k2) || false) ? (m2 || "function" !== typeof g.UNSAFE_componentWillUpdate && "function" !== typeof g.componentWillUpdate || ("function" === typeof g.componentWillUpdate && g.componentWillUpdate(d, n2, k2), "function" === typeof g.UNSAFE_componentWillUpdate && g.UNSAFE_componentWillUpdate(d, n2, k2)), "function" === typeof g.componentDidUpdate && (b.flags |= 4), "function" === typeof g.getSnapshotBeforeUpdate && (b.flags |= 1024)) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r2 === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r2 === a.memoizedState || (b.flags |= 1024), b.memoizedProps = d, b.memoizedState = n2), g.props = d, g.state = n2, g.context = k2, d = l2) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r2 === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r2 === a.memoizedState || (b.flags |= 1024), d = false);
  }
  return jj(a, b, c, d, f2, e);
}
function jj(a, b, c, d, e, f2) {
  gj(a, b);
  var g = 0 !== (b.flags & 128);
  if (!d && !g)
    return e && dg(b, c, false), Zi(a, b, f2);
  d = b.stateNode;
  Wi.current = b;
  var h = g && "function" !== typeof c.getDerivedStateFromError ? null : d.render();
  b.flags |= 1;
  null !== a && g ? (b.child = Ug(b, a.child, null, f2), b.child = Ug(b, null, h, f2)) : Xi(a, b, h, f2);
  b.memoizedState = d.state;
  e && dg(b, c, true);
  return b.child;
}
function kj(a) {
  var b = a.stateNode;
  b.pendingContext ? ag(a, b.pendingContext, b.pendingContext !== b.context) : b.context && ag(a, b.context, false);
  yh(a, b.containerInfo);
}
function lj(a, b, c, d, e) {
  Ig();
  Jg(e);
  b.flags |= 256;
  Xi(a, b, c, d);
  return b.child;
}
var mj = { dehydrated: null, treeContext: null, retryLane: 0 };
function nj(a) {
  return { baseLanes: a, cachePool: null, transitions: null };
}
function oj(a, b, c) {
  var d = b.pendingProps, e = L.current, f2 = false, g = 0 !== (b.flags & 128), h;
  (h = g) || (h = null !== a && null === a.memoizedState ? false : 0 !== (e & 2));
  if (h)
    f2 = true, b.flags &= -129;
  else if (null === a || null !== a.memoizedState)
    e |= 1;
  G(L, e & 1);
  if (null === a) {
    Eg(b);
    a = b.memoizedState;
    if (null !== a && (a = a.dehydrated, null !== a))
      return 0 === (b.mode & 1) ? b.lanes = 1 : "$!" === a.data ? b.lanes = 8 : b.lanes = 1073741824, null;
    g = d.children;
    a = d.fallback;
    return f2 ? (d = b.mode, f2 = b.child, g = { mode: "hidden", children: g }, 0 === (d & 1) && null !== f2 ? (f2.childLanes = 0, f2.pendingProps = g) : f2 = pj(g, d, 0, null), a = Tg(a, d, c, null), f2.return = b, a.return = b, f2.sibling = a, b.child = f2, b.child.memoizedState = nj(c), b.memoizedState = mj, a) : qj(b, g);
  }
  e = a.memoizedState;
  if (null !== e && (h = e.dehydrated, null !== h))
    return rj(a, b, g, d, h, e, c);
  if (f2) {
    f2 = d.fallback;
    g = b.mode;
    e = a.child;
    h = e.sibling;
    var k2 = { mode: "hidden", children: d.children };
    0 === (g & 1) && b.child !== e ? (d = b.child, d.childLanes = 0, d.pendingProps = k2, b.deletions = null) : (d = Pg(e, k2), d.subtreeFlags = e.subtreeFlags & 14680064);
    null !== h ? f2 = Pg(h, f2) : (f2 = Tg(f2, g, c, null), f2.flags |= 2);
    f2.return = b;
    d.return = b;
    d.sibling = f2;
    b.child = d;
    d = f2;
    f2 = b.child;
    g = a.child.memoizedState;
    g = null === g ? nj(c) : { baseLanes: g.baseLanes | c, cachePool: null, transitions: g.transitions };
    f2.memoizedState = g;
    f2.childLanes = a.childLanes & ~c;
    b.memoizedState = mj;
    return d;
  }
  f2 = a.child;
  a = f2.sibling;
  d = Pg(f2, { mode: "visible", children: d.children });
  0 === (b.mode & 1) && (d.lanes = c);
  d.return = b;
  d.sibling = null;
  null !== a && (c = b.deletions, null === c ? (b.deletions = [a], b.flags |= 16) : c.push(a));
  b.child = d;
  b.memoizedState = null;
  return d;
}
function qj(a, b) {
  b = pj({ mode: "visible", children: b }, a.mode, 0, null);
  b.return = a;
  return a.child = b;
}
function sj(a, b, c, d) {
  null !== d && Jg(d);
  Ug(b, a.child, null, c);
  a = qj(b, b.pendingProps.children);
  a.flags |= 2;
  b.memoizedState = null;
  return a;
}
function rj(a, b, c, d, e, f2, g) {
  if (c) {
    if (b.flags & 256)
      return b.flags &= -257, d = Ki(Error(p$1(422))), sj(a, b, g, d);
    if (null !== b.memoizedState)
      return b.child = a.child, b.flags |= 128, null;
    f2 = d.fallback;
    e = b.mode;
    d = pj({ mode: "visible", children: d.children }, e, 0, null);
    f2 = Tg(f2, e, g, null);
    f2.flags |= 2;
    d.return = b;
    f2.return = b;
    d.sibling = f2;
    b.child = d;
    0 !== (b.mode & 1) && Ug(b, a.child, null, g);
    b.child.memoizedState = nj(g);
    b.memoizedState = mj;
    return f2;
  }
  if (0 === (b.mode & 1))
    return sj(a, b, g, null);
  if ("$!" === e.data) {
    d = e.nextSibling && e.nextSibling.dataset;
    if (d)
      var h = d.dgst;
    d = h;
    f2 = Error(p$1(419));
    d = Ki(f2, d, void 0);
    return sj(a, b, g, d);
  }
  h = 0 !== (g & a.childLanes);
  if (dh || h) {
    d = Q;
    if (null !== d) {
      switch (g & -g) {
        case 4:
          e = 2;
          break;
        case 16:
          e = 8;
          break;
        case 64:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
        case 67108864:
          e = 32;
          break;
        case 536870912:
          e = 268435456;
          break;
        default:
          e = 0;
      }
      e = 0 !== (e & (d.suspendedLanes | g)) ? 0 : e;
      0 !== e && e !== f2.retryLane && (f2.retryLane = e, ih(a, e), gi(d, a, e, -1));
    }
    tj();
    d = Ki(Error(p$1(421)));
    return sj(a, b, g, d);
  }
  if ("$?" === e.data)
    return b.flags |= 128, b.child = a.child, b = uj.bind(null, a), e._reactRetry = b, null;
  a = f2.treeContext;
  yg = Lf(e.nextSibling);
  xg = b;
  I = true;
  zg = null;
  null !== a && (og[pg++] = rg, og[pg++] = sg, og[pg++] = qg, rg = a.id, sg = a.overflow, qg = b);
  b = qj(b, d.children);
  b.flags |= 4096;
  return b;
}
function vj(a, b, c) {
  a.lanes |= b;
  var d = a.alternate;
  null !== d && (d.lanes |= b);
  bh(a.return, b, c);
}
function wj(a, b, c, d, e) {
  var f2 = a.memoizedState;
  null === f2 ? a.memoizedState = { isBackwards: b, rendering: null, renderingStartTime: 0, last: d, tail: c, tailMode: e } : (f2.isBackwards = b, f2.rendering = null, f2.renderingStartTime = 0, f2.last = d, f2.tail = c, f2.tailMode = e);
}
function xj(a, b, c) {
  var d = b.pendingProps, e = d.revealOrder, f2 = d.tail;
  Xi(a, b, d.children, c);
  d = L.current;
  if (0 !== (d & 2))
    d = d & 1 | 2, b.flags |= 128;
  else {
    if (null !== a && 0 !== (a.flags & 128))
      a:
        for (a = b.child; null !== a; ) {
          if (13 === a.tag)
            null !== a.memoizedState && vj(a, c, b);
          else if (19 === a.tag)
            vj(a, c, b);
          else if (null !== a.child) {
            a.child.return = a;
            a = a.child;
            continue;
          }
          if (a === b)
            break a;
          for (; null === a.sibling; ) {
            if (null === a.return || a.return === b)
              break a;
            a = a.return;
          }
          a.sibling.return = a.return;
          a = a.sibling;
        }
    d &= 1;
  }
  G(L, d);
  if (0 === (b.mode & 1))
    b.memoizedState = null;
  else
    switch (e) {
      case "forwards":
        c = b.child;
        for (e = null; null !== c; )
          a = c.alternate, null !== a && null === Ch(a) && (e = c), c = c.sibling;
        c = e;
        null === c ? (e = b.child, b.child = null) : (e = c.sibling, c.sibling = null);
        wj(b, false, e, c, f2);
        break;
      case "backwards":
        c = null;
        e = b.child;
        for (b.child = null; null !== e; ) {
          a = e.alternate;
          if (null !== a && null === Ch(a)) {
            b.child = e;
            break;
          }
          a = e.sibling;
          e.sibling = c;
          c = e;
          e = a;
        }
        wj(b, true, c, null, f2);
        break;
      case "together":
        wj(b, false, null, null, void 0);
        break;
      default:
        b.memoizedState = null;
    }
  return b.child;
}
function ij(a, b) {
  0 === (b.mode & 1) && null !== a && (a.alternate = null, b.alternate = null, b.flags |= 2);
}
function Zi(a, b, c) {
  null !== a && (b.dependencies = a.dependencies);
  rh |= b.lanes;
  if (0 === (c & b.childLanes))
    return null;
  if (null !== a && b.child !== a.child)
    throw Error(p$1(153));
  if (null !== b.child) {
    a = b.child;
    c = Pg(a, a.pendingProps);
    b.child = c;
    for (c.return = b; null !== a.sibling; )
      a = a.sibling, c = c.sibling = Pg(a, a.pendingProps), c.return = b;
    c.sibling = null;
  }
  return b.child;
}
function yj(a, b, c) {
  switch (b.tag) {
    case 3:
      kj(b);
      Ig();
      break;
    case 5:
      Ah(b);
      break;
    case 1:
      Zf(b.type) && cg(b);
      break;
    case 4:
      yh(b, b.stateNode.containerInfo);
      break;
    case 10:
      var d = b.type._context, e = b.memoizedProps.value;
      G(Wg, d._currentValue);
      d._currentValue = e;
      break;
    case 13:
      d = b.memoizedState;
      if (null !== d) {
        if (null !== d.dehydrated)
          return G(L, L.current & 1), b.flags |= 128, null;
        if (0 !== (c & b.child.childLanes))
          return oj(a, b, c);
        G(L, L.current & 1);
        a = Zi(a, b, c);
        return null !== a ? a.sibling : null;
      }
      G(L, L.current & 1);
      break;
    case 19:
      d = 0 !== (c & b.childLanes);
      if (0 !== (a.flags & 128)) {
        if (d)
          return xj(a, b, c);
        b.flags |= 128;
      }
      e = b.memoizedState;
      null !== e && (e.rendering = null, e.tail = null, e.lastEffect = null);
      G(L, L.current);
      if (d)
        break;
      else
        return null;
    case 22:
    case 23:
      return b.lanes = 0, dj(a, b, c);
  }
  return Zi(a, b, c);
}
var zj, Aj, Bj, Cj;
zj = function(a, b) {
  for (var c = b.child; null !== c; ) {
    if (5 === c.tag || 6 === c.tag)
      a.appendChild(c.stateNode);
    else if (4 !== c.tag && null !== c.child) {
      c.child.return = c;
      c = c.child;
      continue;
    }
    if (c === b)
      break;
    for (; null === c.sibling; ) {
      if (null === c.return || c.return === b)
        return;
      c = c.return;
    }
    c.sibling.return = c.return;
    c = c.sibling;
  }
};
Aj = function() {
};
Bj = function(a, b, c, d) {
  var e = a.memoizedProps;
  if (e !== d) {
    a = b.stateNode;
    xh(uh.current);
    var f2 = null;
    switch (c) {
      case "input":
        e = Ya(a, e);
        d = Ya(a, d);
        f2 = [];
        break;
      case "select":
        e = A({}, e, { value: void 0 });
        d = A({}, d, { value: void 0 });
        f2 = [];
        break;
      case "textarea":
        e = gb(a, e);
        d = gb(a, d);
        f2 = [];
        break;
      default:
        "function" !== typeof e.onClick && "function" === typeof d.onClick && (a.onclick = Bf);
    }
    ub(c, d);
    var g;
    c = null;
    for (l2 in e)
      if (!d.hasOwnProperty(l2) && e.hasOwnProperty(l2) && null != e[l2])
        if ("style" === l2) {
          var h = e[l2];
          for (g in h)
            h.hasOwnProperty(g) && (c || (c = {}), c[g] = "");
        } else
          "dangerouslySetInnerHTML" !== l2 && "children" !== l2 && "suppressContentEditableWarning" !== l2 && "suppressHydrationWarning" !== l2 && "autoFocus" !== l2 && (ea.hasOwnProperty(l2) ? f2 || (f2 = []) : (f2 = f2 || []).push(l2, null));
    for (l2 in d) {
      var k2 = d[l2];
      h = null != e ? e[l2] : void 0;
      if (d.hasOwnProperty(l2) && k2 !== h && (null != k2 || null != h))
        if ("style" === l2)
          if (h) {
            for (g in h)
              !h.hasOwnProperty(g) || k2 && k2.hasOwnProperty(g) || (c || (c = {}), c[g] = "");
            for (g in k2)
              k2.hasOwnProperty(g) && h[g] !== k2[g] && (c || (c = {}), c[g] = k2[g]);
          } else
            c || (f2 || (f2 = []), f2.push(
              l2,
              c
            )), c = k2;
        else
          "dangerouslySetInnerHTML" === l2 ? (k2 = k2 ? k2.__html : void 0, h = h ? h.__html : void 0, null != k2 && h !== k2 && (f2 = f2 || []).push(l2, k2)) : "children" === l2 ? "string" !== typeof k2 && "number" !== typeof k2 || (f2 = f2 || []).push(l2, "" + k2) : "suppressContentEditableWarning" !== l2 && "suppressHydrationWarning" !== l2 && (ea.hasOwnProperty(l2) ? (null != k2 && "onScroll" === l2 && D("scroll", a), f2 || h === k2 || (f2 = [])) : (f2 = f2 || []).push(l2, k2));
    }
    c && (f2 = f2 || []).push("style", c);
    var l2 = f2;
    if (b.updateQueue = l2)
      b.flags |= 4;
  }
};
Cj = function(a, b, c, d) {
  c !== d && (b.flags |= 4);
};
function Dj(a, b) {
  if (!I)
    switch (a.tailMode) {
      case "hidden":
        b = a.tail;
        for (var c = null; null !== b; )
          null !== b.alternate && (c = b), b = b.sibling;
        null === c ? a.tail = null : c.sibling = null;
        break;
      case "collapsed":
        c = a.tail;
        for (var d = null; null !== c; )
          null !== c.alternate && (d = c), c = c.sibling;
        null === d ? b || null === a.tail ? a.tail = null : a.tail.sibling = null : d.sibling = null;
    }
}
function S(a) {
  var b = null !== a.alternate && a.alternate.child === a.child, c = 0, d = 0;
  if (b)
    for (var e = a.child; null !== e; )
      c |= e.lanes | e.childLanes, d |= e.subtreeFlags & 14680064, d |= e.flags & 14680064, e.return = a, e = e.sibling;
  else
    for (e = a.child; null !== e; )
      c |= e.lanes | e.childLanes, d |= e.subtreeFlags, d |= e.flags, e.return = a, e = e.sibling;
  a.subtreeFlags |= d;
  a.childLanes = c;
  return b;
}
function Ej(a, b, c) {
  var d = b.pendingProps;
  wg(b);
  switch (b.tag) {
    case 2:
    case 16:
    case 15:
    case 0:
    case 11:
    case 7:
    case 8:
    case 12:
    case 9:
    case 14:
      return S(b), null;
    case 1:
      return Zf(b.type) && $f(), S(b), null;
    case 3:
      d = b.stateNode;
      zh();
      E(Wf);
      E(H);
      Eh();
      d.pendingContext && (d.context = d.pendingContext, d.pendingContext = null);
      if (null === a || null === a.child)
        Gg(b) ? b.flags |= 4 : null === a || a.memoizedState.isDehydrated && 0 === (b.flags & 256) || (b.flags |= 1024, null !== zg && (Fj(zg), zg = null));
      Aj(a, b);
      S(b);
      return null;
    case 5:
      Bh(b);
      var e = xh(wh.current);
      c = b.type;
      if (null !== a && null != b.stateNode)
        Bj(a, b, c, d, e), a.ref !== b.ref && (b.flags |= 512, b.flags |= 2097152);
      else {
        if (!d) {
          if (null === b.stateNode)
            throw Error(p$1(166));
          S(b);
          return null;
        }
        a = xh(uh.current);
        if (Gg(b)) {
          d = b.stateNode;
          c = b.type;
          var f2 = b.memoizedProps;
          d[Of] = b;
          d[Pf] = f2;
          a = 0 !== (b.mode & 1);
          switch (c) {
            case "dialog":
              D("cancel", d);
              D("close", d);
              break;
            case "iframe":
            case "object":
            case "embed":
              D("load", d);
              break;
            case "video":
            case "audio":
              for (e = 0; e < lf.length; e++)
                D(lf[e], d);
              break;
            case "source":
              D("error", d);
              break;
            case "img":
            case "image":
            case "link":
              D(
                "error",
                d
              );
              D("load", d);
              break;
            case "details":
              D("toggle", d);
              break;
            case "input":
              Za(d, f2);
              D("invalid", d);
              break;
            case "select":
              d._wrapperState = { wasMultiple: !!f2.multiple };
              D("invalid", d);
              break;
            case "textarea":
              hb(d, f2), D("invalid", d);
          }
          ub(c, f2);
          e = null;
          for (var g in f2)
            if (f2.hasOwnProperty(g)) {
              var h = f2[g];
              "children" === g ? "string" === typeof h ? d.textContent !== h && (true !== f2.suppressHydrationWarning && Af(d.textContent, h, a), e = ["children", h]) : "number" === typeof h && d.textContent !== "" + h && (true !== f2.suppressHydrationWarning && Af(
                d.textContent,
                h,
                a
              ), e = ["children", "" + h]) : ea.hasOwnProperty(g) && null != h && "onScroll" === g && D("scroll", d);
            }
          switch (c) {
            case "input":
              Va(d);
              db(d, f2, true);
              break;
            case "textarea":
              Va(d);
              jb(d);
              break;
            case "select":
            case "option":
              break;
            default:
              "function" === typeof f2.onClick && (d.onclick = Bf);
          }
          d = e;
          b.updateQueue = d;
          null !== d && (b.flags |= 4);
        } else {
          g = 9 === e.nodeType ? e : e.ownerDocument;
          "http://www.w3.org/1999/xhtml" === a && (a = kb(c));
          "http://www.w3.org/1999/xhtml" === a ? "script" === c ? (a = g.createElement("div"), a.innerHTML = "<script><\/script>", a = a.removeChild(a.firstChild)) : "string" === typeof d.is ? a = g.createElement(c, { is: d.is }) : (a = g.createElement(c), "select" === c && (g = a, d.multiple ? g.multiple = true : d.size && (g.size = d.size))) : a = g.createElementNS(a, c);
          a[Of] = b;
          a[Pf] = d;
          zj(a, b, false, false);
          b.stateNode = a;
          a: {
            g = vb(c, d);
            switch (c) {
              case "dialog":
                D("cancel", a);
                D("close", a);
                e = d;
                break;
              case "iframe":
              case "object":
              case "embed":
                D("load", a);
                e = d;
                break;
              case "video":
              case "audio":
                for (e = 0; e < lf.length; e++)
                  D(lf[e], a);
                e = d;
                break;
              case "source":
                D("error", a);
                e = d;
                break;
              case "img":
              case "image":
              case "link":
                D(
                  "error",
                  a
                );
                D("load", a);
                e = d;
                break;
              case "details":
                D("toggle", a);
                e = d;
                break;
              case "input":
                Za(a, d);
                e = Ya(a, d);
                D("invalid", a);
                break;
              case "option":
                e = d;
                break;
              case "select":
                a._wrapperState = { wasMultiple: !!d.multiple };
                e = A({}, d, { value: void 0 });
                D("invalid", a);
                break;
              case "textarea":
                hb(a, d);
                e = gb(a, d);
                D("invalid", a);
                break;
              default:
                e = d;
            }
            ub(c, e);
            h = e;
            for (f2 in h)
              if (h.hasOwnProperty(f2)) {
                var k2 = h[f2];
                "style" === f2 ? sb(a, k2) : "dangerouslySetInnerHTML" === f2 ? (k2 = k2 ? k2.__html : void 0, null != k2 && nb(a, k2)) : "children" === f2 ? "string" === typeof k2 ? ("textarea" !== c || "" !== k2) && ob(a, k2) : "number" === typeof k2 && ob(a, "" + k2) : "suppressContentEditableWarning" !== f2 && "suppressHydrationWarning" !== f2 && "autoFocus" !== f2 && (ea.hasOwnProperty(f2) ? null != k2 && "onScroll" === f2 && D("scroll", a) : null != k2 && ta(a, f2, k2, g));
              }
            switch (c) {
              case "input":
                Va(a);
                db(a, d, false);
                break;
              case "textarea":
                Va(a);
                jb(a);
                break;
              case "option":
                null != d.value && a.setAttribute("value", "" + Sa(d.value));
                break;
              case "select":
                a.multiple = !!d.multiple;
                f2 = d.value;
                null != f2 ? fb(a, !!d.multiple, f2, false) : null != d.defaultValue && fb(
                  a,
                  !!d.multiple,
                  d.defaultValue,
                  true
                );
                break;
              default:
                "function" === typeof e.onClick && (a.onclick = Bf);
            }
            switch (c) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                d = !!d.autoFocus;
                break a;
              case "img":
                d = true;
                break a;
              default:
                d = false;
            }
          }
          d && (b.flags |= 4);
        }
        null !== b.ref && (b.flags |= 512, b.flags |= 2097152);
      }
      S(b);
      return null;
    case 6:
      if (a && null != b.stateNode)
        Cj(a, b, a.memoizedProps, d);
      else {
        if ("string" !== typeof d && null === b.stateNode)
          throw Error(p$1(166));
        c = xh(wh.current);
        xh(uh.current);
        if (Gg(b)) {
          d = b.stateNode;
          c = b.memoizedProps;
          d[Of] = b;
          if (f2 = d.nodeValue !== c) {
            if (a = xg, null !== a)
              switch (a.tag) {
                case 3:
                  Af(d.nodeValue, c, 0 !== (a.mode & 1));
                  break;
                case 5:
                  true !== a.memoizedProps.suppressHydrationWarning && Af(d.nodeValue, c, 0 !== (a.mode & 1));
              }
          }
          f2 && (b.flags |= 4);
        } else
          d = (9 === c.nodeType ? c : c.ownerDocument).createTextNode(d), d[Of] = b, b.stateNode = d;
      }
      S(b);
      return null;
    case 13:
      E(L);
      d = b.memoizedState;
      if (null === a || null !== a.memoizedState && null !== a.memoizedState.dehydrated) {
        if (I && null !== yg && 0 !== (b.mode & 1) && 0 === (b.flags & 128))
          Hg(), Ig(), b.flags |= 98560, f2 = false;
        else if (f2 = Gg(b), null !== d && null !== d.dehydrated) {
          if (null === a) {
            if (!f2)
              throw Error(p$1(318));
            f2 = b.memoizedState;
            f2 = null !== f2 ? f2.dehydrated : null;
            if (!f2)
              throw Error(p$1(317));
            f2[Of] = b;
          } else
            Ig(), 0 === (b.flags & 128) && (b.memoizedState = null), b.flags |= 4;
          S(b);
          f2 = false;
        } else
          null !== zg && (Fj(zg), zg = null), f2 = true;
        if (!f2)
          return b.flags & 65536 ? b : null;
      }
      if (0 !== (b.flags & 128))
        return b.lanes = c, b;
      d = null !== d;
      d !== (null !== a && null !== a.memoizedState) && d && (b.child.flags |= 8192, 0 !== (b.mode & 1) && (null === a || 0 !== (L.current & 1) ? 0 === T && (T = 3) : tj()));
      null !== b.updateQueue && (b.flags |= 4);
      S(b);
      return null;
    case 4:
      return zh(), Aj(a, b), null === a && sf(b.stateNode.containerInfo), S(b), null;
    case 10:
      return ah(b.type._context), S(b), null;
    case 17:
      return Zf(b.type) && $f(), S(b), null;
    case 19:
      E(L);
      f2 = b.memoizedState;
      if (null === f2)
        return S(b), null;
      d = 0 !== (b.flags & 128);
      g = f2.rendering;
      if (null === g)
        if (d)
          Dj(f2, false);
        else {
          if (0 !== T || null !== a && 0 !== (a.flags & 128))
            for (a = b.child; null !== a; ) {
              g = Ch(a);
              if (null !== g) {
                b.flags |= 128;
                Dj(f2, false);
                d = g.updateQueue;
                null !== d && (b.updateQueue = d, b.flags |= 4);
                b.subtreeFlags = 0;
                d = c;
                for (c = b.child; null !== c; )
                  f2 = c, a = d, f2.flags &= 14680066, g = f2.alternate, null === g ? (f2.childLanes = 0, f2.lanes = a, f2.child = null, f2.subtreeFlags = 0, f2.memoizedProps = null, f2.memoizedState = null, f2.updateQueue = null, f2.dependencies = null, f2.stateNode = null) : (f2.childLanes = g.childLanes, f2.lanes = g.lanes, f2.child = g.child, f2.subtreeFlags = 0, f2.deletions = null, f2.memoizedProps = g.memoizedProps, f2.memoizedState = g.memoizedState, f2.updateQueue = g.updateQueue, f2.type = g.type, a = g.dependencies, f2.dependencies = null === a ? null : { lanes: a.lanes, firstContext: a.firstContext }), c = c.sibling;
                G(L, L.current & 1 | 2);
                return b.child;
              }
              a = a.sibling;
            }
          null !== f2.tail && B() > Gj && (b.flags |= 128, d = true, Dj(f2, false), b.lanes = 4194304);
        }
      else {
        if (!d)
          if (a = Ch(g), null !== a) {
            if (b.flags |= 128, d = true, c = a.updateQueue, null !== c && (b.updateQueue = c, b.flags |= 4), Dj(f2, true), null === f2.tail && "hidden" === f2.tailMode && !g.alternate && !I)
              return S(b), null;
          } else
            2 * B() - f2.renderingStartTime > Gj && 1073741824 !== c && (b.flags |= 128, d = true, Dj(f2, false), b.lanes = 4194304);
        f2.isBackwards ? (g.sibling = b.child, b.child = g) : (c = f2.last, null !== c ? c.sibling = g : b.child = g, f2.last = g);
      }
      if (null !== f2.tail)
        return b = f2.tail, f2.rendering = b, f2.tail = b.sibling, f2.renderingStartTime = B(), b.sibling = null, c = L.current, G(L, d ? c & 1 | 2 : c & 1), b;
      S(b);
      return null;
    case 22:
    case 23:
      return Hj(), d = null !== b.memoizedState, null !== a && null !== a.memoizedState !== d && (b.flags |= 8192), d && 0 !== (b.mode & 1) ? 0 !== (fj & 1073741824) && (S(b), b.subtreeFlags & 6 && (b.flags |= 8192)) : S(b), null;
    case 24:
      return null;
    case 25:
      return null;
  }
  throw Error(p$1(156, b.tag));
}
function Ij(a, b) {
  wg(b);
  switch (b.tag) {
    case 1:
      return Zf(b.type) && $f(), a = b.flags, a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
    case 3:
      return zh(), E(Wf), E(H), Eh(), a = b.flags, 0 !== (a & 65536) && 0 === (a & 128) ? (b.flags = a & -65537 | 128, b) : null;
    case 5:
      return Bh(b), null;
    case 13:
      E(L);
      a = b.memoizedState;
      if (null !== a && null !== a.dehydrated) {
        if (null === b.alternate)
          throw Error(p$1(340));
        Ig();
      }
      a = b.flags;
      return a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
    case 19:
      return E(L), null;
    case 4:
      return zh(), null;
    case 10:
      return ah(b.type._context), null;
    case 22:
    case 23:
      return Hj(), null;
    case 24:
      return null;
    default:
      return null;
  }
}
var Jj = false, U = false, Kj = "function" === typeof WeakSet ? WeakSet : Set, V = null;
function Lj(a, b) {
  var c = a.ref;
  if (null !== c)
    if ("function" === typeof c)
      try {
        c(null);
      } catch (d) {
        W(a, b, d);
      }
    else
      c.current = null;
}
function Mj(a, b, c) {
  try {
    c();
  } catch (d) {
    W(a, b, d);
  }
}
var Nj = false;
function Oj(a, b) {
  Cf = dd;
  a = Me();
  if (Ne(a)) {
    if ("selectionStart" in a)
      var c = { start: a.selectionStart, end: a.selectionEnd };
    else
      a: {
        c = (c = a.ownerDocument) && c.defaultView || window;
        var d = c.getSelection && c.getSelection();
        if (d && 0 !== d.rangeCount) {
          c = d.anchorNode;
          var e = d.anchorOffset, f2 = d.focusNode;
          d = d.focusOffset;
          try {
            c.nodeType, f2.nodeType;
          } catch (F2) {
            c = null;
            break a;
          }
          var g = 0, h = -1, k2 = -1, l2 = 0, m2 = 0, q2 = a, r2 = null;
          b:
            for (; ; ) {
              for (var y2; ; ) {
                q2 !== c || 0 !== e && 3 !== q2.nodeType || (h = g + e);
                q2 !== f2 || 0 !== d && 3 !== q2.nodeType || (k2 = g + d);
                3 === q2.nodeType && (g += q2.nodeValue.length);
                if (null === (y2 = q2.firstChild))
                  break;
                r2 = q2;
                q2 = y2;
              }
              for (; ; ) {
                if (q2 === a)
                  break b;
                r2 === c && ++l2 === e && (h = g);
                r2 === f2 && ++m2 === d && (k2 = g);
                if (null !== (y2 = q2.nextSibling))
                  break;
                q2 = r2;
                r2 = q2.parentNode;
              }
              q2 = y2;
            }
          c = -1 === h || -1 === k2 ? null : { start: h, end: k2 };
        } else
          c = null;
      }
    c = c || { start: 0, end: 0 };
  } else
    c = null;
  Df = { focusedElem: a, selectionRange: c };
  dd = false;
  for (V = b; null !== V; )
    if (b = V, a = b.child, 0 !== (b.subtreeFlags & 1028) && null !== a)
      a.return = b, V = a;
    else
      for (; null !== V; ) {
        b = V;
        try {
          var n2 = b.alternate;
          if (0 !== (b.flags & 1024))
            switch (b.tag) {
              case 0:
              case 11:
              case 15:
                break;
              case 1:
                if (null !== n2) {
                  var t2 = n2.memoizedProps, J2 = n2.memoizedState, x2 = b.stateNode, w2 = x2.getSnapshotBeforeUpdate(b.elementType === b.type ? t2 : Ci(b.type, t2), J2);
                  x2.__reactInternalSnapshotBeforeUpdate = w2;
                }
                break;
              case 3:
                var u2 = b.stateNode.containerInfo;
                1 === u2.nodeType ? u2.textContent = "" : 9 === u2.nodeType && u2.documentElement && u2.removeChild(u2.documentElement);
                break;
              case 5:
              case 6:
              case 4:
              case 17:
                break;
              default:
                throw Error(p$1(163));
            }
        } catch (F2) {
          W(b, b.return, F2);
        }
        a = b.sibling;
        if (null !== a) {
          a.return = b.return;
          V = a;
          break;
        }
        V = b.return;
      }
  n2 = Nj;
  Nj = false;
  return n2;
}
function Pj(a, b, c) {
  var d = b.updateQueue;
  d = null !== d ? d.lastEffect : null;
  if (null !== d) {
    var e = d = d.next;
    do {
      if ((e.tag & a) === a) {
        var f2 = e.destroy;
        e.destroy = void 0;
        void 0 !== f2 && Mj(b, c, f2);
      }
      e = e.next;
    } while (e !== d);
  }
}
function Qj(a, b) {
  b = b.updateQueue;
  b = null !== b ? b.lastEffect : null;
  if (null !== b) {
    var c = b = b.next;
    do {
      if ((c.tag & a) === a) {
        var d = c.create;
        c.destroy = d();
      }
      c = c.next;
    } while (c !== b);
  }
}
function Rj(a) {
  var b = a.ref;
  if (null !== b) {
    var c = a.stateNode;
    switch (a.tag) {
      case 5:
        a = c;
        break;
      default:
        a = c;
    }
    "function" === typeof b ? b(a) : b.current = a;
  }
}
function Sj(a) {
  var b = a.alternate;
  null !== b && (a.alternate = null, Sj(b));
  a.child = null;
  a.deletions = null;
  a.sibling = null;
  5 === a.tag && (b = a.stateNode, null !== b && (delete b[Of], delete b[Pf], delete b[of], delete b[Qf], delete b[Rf]));
  a.stateNode = null;
  a.return = null;
  a.dependencies = null;
  a.memoizedProps = null;
  a.memoizedState = null;
  a.pendingProps = null;
  a.stateNode = null;
  a.updateQueue = null;
}
function Tj(a) {
  return 5 === a.tag || 3 === a.tag || 4 === a.tag;
}
function Uj(a) {
  a:
    for (; ; ) {
      for (; null === a.sibling; ) {
        if (null === a.return || Tj(a.return))
          return null;
        a = a.return;
      }
      a.sibling.return = a.return;
      for (a = a.sibling; 5 !== a.tag && 6 !== a.tag && 18 !== a.tag; ) {
        if (a.flags & 2)
          continue a;
        if (null === a.child || 4 === a.tag)
          continue a;
        else
          a.child.return = a, a = a.child;
      }
      if (!(a.flags & 2))
        return a.stateNode;
    }
}
function Vj(a, b, c) {
  var d = a.tag;
  if (5 === d || 6 === d)
    a = a.stateNode, b ? 8 === c.nodeType ? c.parentNode.insertBefore(a, b) : c.insertBefore(a, b) : (8 === c.nodeType ? (b = c.parentNode, b.insertBefore(a, c)) : (b = c, b.appendChild(a)), c = c._reactRootContainer, null !== c && void 0 !== c || null !== b.onclick || (b.onclick = Bf));
  else if (4 !== d && (a = a.child, null !== a))
    for (Vj(a, b, c), a = a.sibling; null !== a; )
      Vj(a, b, c), a = a.sibling;
}
function Wj(a, b, c) {
  var d = a.tag;
  if (5 === d || 6 === d)
    a = a.stateNode, b ? c.insertBefore(a, b) : c.appendChild(a);
  else if (4 !== d && (a = a.child, null !== a))
    for (Wj(a, b, c), a = a.sibling; null !== a; )
      Wj(a, b, c), a = a.sibling;
}
var X = null, Xj = false;
function Yj(a, b, c) {
  for (c = c.child; null !== c; )
    Zj(a, b, c), c = c.sibling;
}
function Zj(a, b, c) {
  if (lc && "function" === typeof lc.onCommitFiberUnmount)
    try {
      lc.onCommitFiberUnmount(kc, c);
    } catch (h) {
    }
  switch (c.tag) {
    case 5:
      U || Lj(c, b);
    case 6:
      var d = X, e = Xj;
      X = null;
      Yj(a, b, c);
      X = d;
      Xj = e;
      null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? a.parentNode.removeChild(c) : a.removeChild(c)) : X.removeChild(c.stateNode));
      break;
    case 18:
      null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? Kf(a.parentNode, c) : 1 === a.nodeType && Kf(a, c), bd(a)) : Kf(X, c.stateNode));
      break;
    case 4:
      d = X;
      e = Xj;
      X = c.stateNode.containerInfo;
      Xj = true;
      Yj(a, b, c);
      X = d;
      Xj = e;
      break;
    case 0:
    case 11:
    case 14:
    case 15:
      if (!U && (d = c.updateQueue, null !== d && (d = d.lastEffect, null !== d))) {
        e = d = d.next;
        do {
          var f2 = e, g = f2.destroy;
          f2 = f2.tag;
          void 0 !== g && (0 !== (f2 & 2) ? Mj(c, b, g) : 0 !== (f2 & 4) && Mj(c, b, g));
          e = e.next;
        } while (e !== d);
      }
      Yj(a, b, c);
      break;
    case 1:
      if (!U && (Lj(c, b), d = c.stateNode, "function" === typeof d.componentWillUnmount))
        try {
          d.props = c.memoizedProps, d.state = c.memoizedState, d.componentWillUnmount();
        } catch (h) {
          W(c, b, h);
        }
      Yj(a, b, c);
      break;
    case 21:
      Yj(a, b, c);
      break;
    case 22:
      c.mode & 1 ? (U = (d = U) || null !== c.memoizedState, Yj(a, b, c), U = d) : Yj(a, b, c);
      break;
    default:
      Yj(a, b, c);
  }
}
function ak(a) {
  var b = a.updateQueue;
  if (null !== b) {
    a.updateQueue = null;
    var c = a.stateNode;
    null === c && (c = a.stateNode = new Kj());
    b.forEach(function(b2) {
      var d = bk.bind(null, a, b2);
      c.has(b2) || (c.add(b2), b2.then(d, d));
    });
  }
}
function ck(a, b) {
  var c = b.deletions;
  if (null !== c)
    for (var d = 0; d < c.length; d++) {
      var e = c[d];
      try {
        var f2 = a, g = b, h = g;
        a:
          for (; null !== h; ) {
            switch (h.tag) {
              case 5:
                X = h.stateNode;
                Xj = false;
                break a;
              case 3:
                X = h.stateNode.containerInfo;
                Xj = true;
                break a;
              case 4:
                X = h.stateNode.containerInfo;
                Xj = true;
                break a;
            }
            h = h.return;
          }
        if (null === X)
          throw Error(p$1(160));
        Zj(f2, g, e);
        X = null;
        Xj = false;
        var k2 = e.alternate;
        null !== k2 && (k2.return = null);
        e.return = null;
      } catch (l2) {
        W(e, b, l2);
      }
    }
  if (b.subtreeFlags & 12854)
    for (b = b.child; null !== b; )
      dk(b, a), b = b.sibling;
}
function dk(a, b) {
  var c = a.alternate, d = a.flags;
  switch (a.tag) {
    case 0:
    case 11:
    case 14:
    case 15:
      ck(b, a);
      ek(a);
      if (d & 4) {
        try {
          Pj(3, a, a.return), Qj(3, a);
        } catch (t2) {
          W(a, a.return, t2);
        }
        try {
          Pj(5, a, a.return);
        } catch (t2) {
          W(a, a.return, t2);
        }
      }
      break;
    case 1:
      ck(b, a);
      ek(a);
      d & 512 && null !== c && Lj(c, c.return);
      break;
    case 5:
      ck(b, a);
      ek(a);
      d & 512 && null !== c && Lj(c, c.return);
      if (a.flags & 32) {
        var e = a.stateNode;
        try {
          ob(e, "");
        } catch (t2) {
          W(a, a.return, t2);
        }
      }
      if (d & 4 && (e = a.stateNode, null != e)) {
        var f2 = a.memoizedProps, g = null !== c ? c.memoizedProps : f2, h = a.type, k2 = a.updateQueue;
        a.updateQueue = null;
        if (null !== k2)
          try {
            "input" === h && "radio" === f2.type && null != f2.name && ab(e, f2);
            vb(h, g);
            var l2 = vb(h, f2);
            for (g = 0; g < k2.length; g += 2) {
              var m2 = k2[g], q2 = k2[g + 1];
              "style" === m2 ? sb(e, q2) : "dangerouslySetInnerHTML" === m2 ? nb(e, q2) : "children" === m2 ? ob(e, q2) : ta(e, m2, q2, l2);
            }
            switch (h) {
              case "input":
                bb(e, f2);
                break;
              case "textarea":
                ib(e, f2);
                break;
              case "select":
                var r2 = e._wrapperState.wasMultiple;
                e._wrapperState.wasMultiple = !!f2.multiple;
                var y2 = f2.value;
                null != y2 ? fb(e, !!f2.multiple, y2, false) : r2 !== !!f2.multiple && (null != f2.defaultValue ? fb(
                  e,
                  !!f2.multiple,
                  f2.defaultValue,
                  true
                ) : fb(e, !!f2.multiple, f2.multiple ? [] : "", false));
            }
            e[Pf] = f2;
          } catch (t2) {
            W(a, a.return, t2);
          }
      }
      break;
    case 6:
      ck(b, a);
      ek(a);
      if (d & 4) {
        if (null === a.stateNode)
          throw Error(p$1(162));
        e = a.stateNode;
        f2 = a.memoizedProps;
        try {
          e.nodeValue = f2;
        } catch (t2) {
          W(a, a.return, t2);
        }
      }
      break;
    case 3:
      ck(b, a);
      ek(a);
      if (d & 4 && null !== c && c.memoizedState.isDehydrated)
        try {
          bd(b.containerInfo);
        } catch (t2) {
          W(a, a.return, t2);
        }
      break;
    case 4:
      ck(b, a);
      ek(a);
      break;
    case 13:
      ck(b, a);
      ek(a);
      e = a.child;
      e.flags & 8192 && (f2 = null !== e.memoizedState, e.stateNode.isHidden = f2, !f2 || null !== e.alternate && null !== e.alternate.memoizedState || (fk = B()));
      d & 4 && ak(a);
      break;
    case 22:
      m2 = null !== c && null !== c.memoizedState;
      a.mode & 1 ? (U = (l2 = U) || m2, ck(b, a), U = l2) : ck(b, a);
      ek(a);
      if (d & 8192) {
        l2 = null !== a.memoizedState;
        if ((a.stateNode.isHidden = l2) && !m2 && 0 !== (a.mode & 1))
          for (V = a, m2 = a.child; null !== m2; ) {
            for (q2 = V = m2; null !== V; ) {
              r2 = V;
              y2 = r2.child;
              switch (r2.tag) {
                case 0:
                case 11:
                case 14:
                case 15:
                  Pj(4, r2, r2.return);
                  break;
                case 1:
                  Lj(r2, r2.return);
                  var n2 = r2.stateNode;
                  if ("function" === typeof n2.componentWillUnmount) {
                    d = r2;
                    c = r2.return;
                    try {
                      b = d, n2.props = b.memoizedProps, n2.state = b.memoizedState, n2.componentWillUnmount();
                    } catch (t2) {
                      W(d, c, t2);
                    }
                  }
                  break;
                case 5:
                  Lj(r2, r2.return);
                  break;
                case 22:
                  if (null !== r2.memoizedState) {
                    gk(q2);
                    continue;
                  }
              }
              null !== y2 ? (y2.return = r2, V = y2) : gk(q2);
            }
            m2 = m2.sibling;
          }
        a:
          for (m2 = null, q2 = a; ; ) {
            if (5 === q2.tag) {
              if (null === m2) {
                m2 = q2;
                try {
                  e = q2.stateNode, l2 ? (f2 = e.style, "function" === typeof f2.setProperty ? f2.setProperty("display", "none", "important") : f2.display = "none") : (h = q2.stateNode, k2 = q2.memoizedProps.style, g = void 0 !== k2 && null !== k2 && k2.hasOwnProperty("display") ? k2.display : null, h.style.display = rb("display", g));
                } catch (t2) {
                  W(a, a.return, t2);
                }
              }
            } else if (6 === q2.tag) {
              if (null === m2)
                try {
                  q2.stateNode.nodeValue = l2 ? "" : q2.memoizedProps;
                } catch (t2) {
                  W(a, a.return, t2);
                }
            } else if ((22 !== q2.tag && 23 !== q2.tag || null === q2.memoizedState || q2 === a) && null !== q2.child) {
              q2.child.return = q2;
              q2 = q2.child;
              continue;
            }
            if (q2 === a)
              break a;
            for (; null === q2.sibling; ) {
              if (null === q2.return || q2.return === a)
                break a;
              m2 === q2 && (m2 = null);
              q2 = q2.return;
            }
            m2 === q2 && (m2 = null);
            q2.sibling.return = q2.return;
            q2 = q2.sibling;
          }
      }
      break;
    case 19:
      ck(b, a);
      ek(a);
      d & 4 && ak(a);
      break;
    case 21:
      break;
    default:
      ck(
        b,
        a
      ), ek(a);
  }
}
function ek(a) {
  var b = a.flags;
  if (b & 2) {
    try {
      a: {
        for (var c = a.return; null !== c; ) {
          if (Tj(c)) {
            var d = c;
            break a;
          }
          c = c.return;
        }
        throw Error(p$1(160));
      }
      switch (d.tag) {
        case 5:
          var e = d.stateNode;
          d.flags & 32 && (ob(e, ""), d.flags &= -33);
          var f2 = Uj(a);
          Wj(a, f2, e);
          break;
        case 3:
        case 4:
          var g = d.stateNode.containerInfo, h = Uj(a);
          Vj(a, h, g);
          break;
        default:
          throw Error(p$1(161));
      }
    } catch (k2) {
      W(a, a.return, k2);
    }
    a.flags &= -3;
  }
  b & 4096 && (a.flags &= -4097);
}
function hk(a, b, c) {
  V = a;
  ik(a);
}
function ik(a, b, c) {
  for (var d = 0 !== (a.mode & 1); null !== V; ) {
    var e = V, f2 = e.child;
    if (22 === e.tag && d) {
      var g = null !== e.memoizedState || Jj;
      if (!g) {
        var h = e.alternate, k2 = null !== h && null !== h.memoizedState || U;
        h = Jj;
        var l2 = U;
        Jj = g;
        if ((U = k2) && !l2)
          for (V = e; null !== V; )
            g = V, k2 = g.child, 22 === g.tag && null !== g.memoizedState ? jk(e) : null !== k2 ? (k2.return = g, V = k2) : jk(e);
        for (; null !== f2; )
          V = f2, ik(f2), f2 = f2.sibling;
        V = e;
        Jj = h;
        U = l2;
      }
      kk(a);
    } else
      0 !== (e.subtreeFlags & 8772) && null !== f2 ? (f2.return = e, V = f2) : kk(a);
  }
}
function kk(a) {
  for (; null !== V; ) {
    var b = V;
    if (0 !== (b.flags & 8772)) {
      var c = b.alternate;
      try {
        if (0 !== (b.flags & 8772))
          switch (b.tag) {
            case 0:
            case 11:
            case 15:
              U || Qj(5, b);
              break;
            case 1:
              var d = b.stateNode;
              if (b.flags & 4 && !U)
                if (null === c)
                  d.componentDidMount();
                else {
                  var e = b.elementType === b.type ? c.memoizedProps : Ci(b.type, c.memoizedProps);
                  d.componentDidUpdate(e, c.memoizedState, d.__reactInternalSnapshotBeforeUpdate);
                }
              var f2 = b.updateQueue;
              null !== f2 && sh(b, f2, d);
              break;
            case 3:
              var g = b.updateQueue;
              if (null !== g) {
                c = null;
                if (null !== b.child)
                  switch (b.child.tag) {
                    case 5:
                      c = b.child.stateNode;
                      break;
                    case 1:
                      c = b.child.stateNode;
                  }
                sh(b, g, c);
              }
              break;
            case 5:
              var h = b.stateNode;
              if (null === c && b.flags & 4) {
                c = h;
                var k2 = b.memoizedProps;
                switch (b.type) {
                  case "button":
                  case "input":
                  case "select":
                  case "textarea":
                    k2.autoFocus && c.focus();
                    break;
                  case "img":
                    k2.src && (c.src = k2.src);
                }
              }
              break;
            case 6:
              break;
            case 4:
              break;
            case 12:
              break;
            case 13:
              if (null === b.memoizedState) {
                var l2 = b.alternate;
                if (null !== l2) {
                  var m2 = l2.memoizedState;
                  if (null !== m2) {
                    var q2 = m2.dehydrated;
                    null !== q2 && bd(q2);
                  }
                }
              }
              break;
            case 19:
            case 17:
            case 21:
            case 22:
            case 23:
            case 25:
              break;
            default:
              throw Error(p$1(163));
          }
        U || b.flags & 512 && Rj(b);
      } catch (r2) {
        W(b, b.return, r2);
      }
    }
    if (b === a) {
      V = null;
      break;
    }
    c = b.sibling;
    if (null !== c) {
      c.return = b.return;
      V = c;
      break;
    }
    V = b.return;
  }
}
function gk(a) {
  for (; null !== V; ) {
    var b = V;
    if (b === a) {
      V = null;
      break;
    }
    var c = b.sibling;
    if (null !== c) {
      c.return = b.return;
      V = c;
      break;
    }
    V = b.return;
  }
}
function jk(a) {
  for (; null !== V; ) {
    var b = V;
    try {
      switch (b.tag) {
        case 0:
        case 11:
        case 15:
          var c = b.return;
          try {
            Qj(4, b);
          } catch (k2) {
            W(b, c, k2);
          }
          break;
        case 1:
          var d = b.stateNode;
          if ("function" === typeof d.componentDidMount) {
            var e = b.return;
            try {
              d.componentDidMount();
            } catch (k2) {
              W(b, e, k2);
            }
          }
          var f2 = b.return;
          try {
            Rj(b);
          } catch (k2) {
            W(b, f2, k2);
          }
          break;
        case 5:
          var g = b.return;
          try {
            Rj(b);
          } catch (k2) {
            W(b, g, k2);
          }
      }
    } catch (k2) {
      W(b, b.return, k2);
    }
    if (b === a) {
      V = null;
      break;
    }
    var h = b.sibling;
    if (null !== h) {
      h.return = b.return;
      V = h;
      break;
    }
    V = b.return;
  }
}
var lk = Math.ceil, mk = ua.ReactCurrentDispatcher, nk = ua.ReactCurrentOwner, ok = ua.ReactCurrentBatchConfig, K = 0, Q = null, Y = null, Z = 0, fj = 0, ej = Uf(0), T = 0, pk = null, rh = 0, qk = 0, rk = 0, sk = null, tk = null, fk = 0, Gj = Infinity, uk = null, Oi = false, Pi = null, Ri = null, vk = false, wk = null, xk = 0, yk = 0, zk = null, Ak = -1, Bk = 0;
function R() {
  return 0 !== (K & 6) ? B() : -1 !== Ak ? Ak : Ak = B();
}
function yi(a) {
  if (0 === (a.mode & 1))
    return 1;
  if (0 !== (K & 2) && 0 !== Z)
    return Z & -Z;
  if (null !== Kg.transition)
    return 0 === Bk && (Bk = yc()), Bk;
  a = C;
  if (0 !== a)
    return a;
  a = window.event;
  a = void 0 === a ? 16 : jd(a.type);
  return a;
}
function gi(a, b, c, d) {
  if (50 < yk)
    throw yk = 0, zk = null, Error(p$1(185));
  Ac(a, c, d);
  if (0 === (K & 2) || a !== Q)
    a === Q && (0 === (K & 2) && (qk |= c), 4 === T && Ck(a, Z)), Dk(a, d), 1 === c && 0 === K && 0 === (b.mode & 1) && (Gj = B() + 500, fg && jg());
}
function Dk(a, b) {
  var c = a.callbackNode;
  wc(a, b);
  var d = uc(a, a === Q ? Z : 0);
  if (0 === d)
    null !== c && bc(c), a.callbackNode = null, a.callbackPriority = 0;
  else if (b = d & -d, a.callbackPriority !== b) {
    null != c && bc(c);
    if (1 === b)
      0 === a.tag ? ig(Ek.bind(null, a)) : hg(Ek.bind(null, a)), Jf(function() {
        0 === (K & 6) && jg();
      }), c = null;
    else {
      switch (Dc(d)) {
        case 1:
          c = fc;
          break;
        case 4:
          c = gc;
          break;
        case 16:
          c = hc;
          break;
        case 536870912:
          c = jc;
          break;
        default:
          c = hc;
      }
      c = Fk(c, Gk.bind(null, a));
    }
    a.callbackPriority = b;
    a.callbackNode = c;
  }
}
function Gk(a, b) {
  Ak = -1;
  Bk = 0;
  if (0 !== (K & 6))
    throw Error(p$1(327));
  var c = a.callbackNode;
  if (Hk() && a.callbackNode !== c)
    return null;
  var d = uc(a, a === Q ? Z : 0);
  if (0 === d)
    return null;
  if (0 !== (d & 30) || 0 !== (d & a.expiredLanes) || b)
    b = Ik(a, d);
  else {
    b = d;
    var e = K;
    K |= 2;
    var f2 = Jk();
    if (Q !== a || Z !== b)
      uk = null, Gj = B() + 500, Kk(a, b);
    do
      try {
        Lk();
        break;
      } catch (h) {
        Mk(a, h);
      }
    while (1);
    $g();
    mk.current = f2;
    K = e;
    null !== Y ? b = 0 : (Q = null, Z = 0, b = T);
  }
  if (0 !== b) {
    2 === b && (e = xc(a), 0 !== e && (d = e, b = Nk(a, e)));
    if (1 === b)
      throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
    if (6 === b)
      Ck(a, d);
    else {
      e = a.current.alternate;
      if (0 === (d & 30) && !Ok(e) && (b = Ik(a, d), 2 === b && (f2 = xc(a), 0 !== f2 && (d = f2, b = Nk(a, f2))), 1 === b))
        throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
      a.finishedWork = e;
      a.finishedLanes = d;
      switch (b) {
        case 0:
        case 1:
          throw Error(p$1(345));
        case 2:
          Pk(a, tk, uk);
          break;
        case 3:
          Ck(a, d);
          if ((d & 130023424) === d && (b = fk + 500 - B(), 10 < b)) {
            if (0 !== uc(a, 0))
              break;
            e = a.suspendedLanes;
            if ((e & d) !== d) {
              R();
              a.pingedLanes |= a.suspendedLanes & e;
              break;
            }
            a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), b);
            break;
          }
          Pk(a, tk, uk);
          break;
        case 4:
          Ck(a, d);
          if ((d & 4194240) === d)
            break;
          b = a.eventTimes;
          for (e = -1; 0 < d; ) {
            var g = 31 - oc(d);
            f2 = 1 << g;
            g = b[g];
            g > e && (e = g);
            d &= ~f2;
          }
          d = e;
          d = B() - d;
          d = (120 > d ? 120 : 480 > d ? 480 : 1080 > d ? 1080 : 1920 > d ? 1920 : 3e3 > d ? 3e3 : 4320 > d ? 4320 : 1960 * lk(d / 1960)) - d;
          if (10 < d) {
            a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), d);
            break;
          }
          Pk(a, tk, uk);
          break;
        case 5:
          Pk(a, tk, uk);
          break;
        default:
          throw Error(p$1(329));
      }
    }
  }
  Dk(a, B());
  return a.callbackNode === c ? Gk.bind(null, a) : null;
}
function Nk(a, b) {
  var c = sk;
  a.current.memoizedState.isDehydrated && (Kk(a, b).flags |= 256);
  a = Ik(a, b);
  2 !== a && (b = tk, tk = c, null !== b && Fj(b));
  return a;
}
function Fj(a) {
  null === tk ? tk = a : tk.push.apply(tk, a);
}
function Ok(a) {
  for (var b = a; ; ) {
    if (b.flags & 16384) {
      var c = b.updateQueue;
      if (null !== c && (c = c.stores, null !== c))
        for (var d = 0; d < c.length; d++) {
          var e = c[d], f2 = e.getSnapshot;
          e = e.value;
          try {
            if (!He(f2(), e))
              return false;
          } catch (g) {
            return false;
          }
        }
    }
    c = b.child;
    if (b.subtreeFlags & 16384 && null !== c)
      c.return = b, b = c;
    else {
      if (b === a)
        break;
      for (; null === b.sibling; ) {
        if (null === b.return || b.return === a)
          return true;
        b = b.return;
      }
      b.sibling.return = b.return;
      b = b.sibling;
    }
  }
  return true;
}
function Ck(a, b) {
  b &= ~rk;
  b &= ~qk;
  a.suspendedLanes |= b;
  a.pingedLanes &= ~b;
  for (a = a.expirationTimes; 0 < b; ) {
    var c = 31 - oc(b), d = 1 << c;
    a[c] = -1;
    b &= ~d;
  }
}
function Ek(a) {
  if (0 !== (K & 6))
    throw Error(p$1(327));
  Hk();
  var b = uc(a, 0);
  if (0 === (b & 1))
    return Dk(a, B()), null;
  var c = Ik(a, b);
  if (0 !== a.tag && 2 === c) {
    var d = xc(a);
    0 !== d && (b = d, c = Nk(a, d));
  }
  if (1 === c)
    throw c = pk, Kk(a, 0), Ck(a, b), Dk(a, B()), c;
  if (6 === c)
    throw Error(p$1(345));
  a.finishedWork = a.current.alternate;
  a.finishedLanes = b;
  Pk(a, tk, uk);
  Dk(a, B());
  return null;
}
function Qk(a, b) {
  var c = K;
  K |= 1;
  try {
    return a(b);
  } finally {
    K = c, 0 === K && (Gj = B() + 500, fg && jg());
  }
}
function Rk(a) {
  null !== wk && 0 === wk.tag && 0 === (K & 6) && Hk();
  var b = K;
  K |= 1;
  var c = ok.transition, d = C;
  try {
    if (ok.transition = null, C = 1, a)
      return a();
  } finally {
    C = d, ok.transition = c, K = b, 0 === (K & 6) && jg();
  }
}
function Hj() {
  fj = ej.current;
  E(ej);
}
function Kk(a, b) {
  a.finishedWork = null;
  a.finishedLanes = 0;
  var c = a.timeoutHandle;
  -1 !== c && (a.timeoutHandle = -1, Gf(c));
  if (null !== Y)
    for (c = Y.return; null !== c; ) {
      var d = c;
      wg(d);
      switch (d.tag) {
        case 1:
          d = d.type.childContextTypes;
          null !== d && void 0 !== d && $f();
          break;
        case 3:
          zh();
          E(Wf);
          E(H);
          Eh();
          break;
        case 5:
          Bh(d);
          break;
        case 4:
          zh();
          break;
        case 13:
          E(L);
          break;
        case 19:
          E(L);
          break;
        case 10:
          ah(d.type._context);
          break;
        case 22:
        case 23:
          Hj();
      }
      c = c.return;
    }
  Q = a;
  Y = a = Pg(a.current, null);
  Z = fj = b;
  T = 0;
  pk = null;
  rk = qk = rh = 0;
  tk = sk = null;
  if (null !== fh) {
    for (b = 0; b < fh.length; b++)
      if (c = fh[b], d = c.interleaved, null !== d) {
        c.interleaved = null;
        var e = d.next, f2 = c.pending;
        if (null !== f2) {
          var g = f2.next;
          f2.next = e;
          d.next = g;
        }
        c.pending = d;
      }
    fh = null;
  }
  return a;
}
function Mk(a, b) {
  do {
    var c = Y;
    try {
      $g();
      Fh.current = Rh;
      if (Ih) {
        for (var d = M.memoizedState; null !== d; ) {
          var e = d.queue;
          null !== e && (e.pending = null);
          d = d.next;
        }
        Ih = false;
      }
      Hh = 0;
      O = N = M = null;
      Jh = false;
      Kh = 0;
      nk.current = null;
      if (null === c || null === c.return) {
        T = 1;
        pk = b;
        Y = null;
        break;
      }
      a: {
        var f2 = a, g = c.return, h = c, k2 = b;
        b = Z;
        h.flags |= 32768;
        if (null !== k2 && "object" === typeof k2 && "function" === typeof k2.then) {
          var l2 = k2, m2 = h, q2 = m2.tag;
          if (0 === (m2.mode & 1) && (0 === q2 || 11 === q2 || 15 === q2)) {
            var r2 = m2.alternate;
            r2 ? (m2.updateQueue = r2.updateQueue, m2.memoizedState = r2.memoizedState, m2.lanes = r2.lanes) : (m2.updateQueue = null, m2.memoizedState = null);
          }
          var y2 = Ui(g);
          if (null !== y2) {
            y2.flags &= -257;
            Vi(y2, g, h, f2, b);
            y2.mode & 1 && Si(f2, l2, b);
            b = y2;
            k2 = l2;
            var n2 = b.updateQueue;
            if (null === n2) {
              var t2 = /* @__PURE__ */ new Set();
              t2.add(k2);
              b.updateQueue = t2;
            } else
              n2.add(k2);
            break a;
          } else {
            if (0 === (b & 1)) {
              Si(f2, l2, b);
              tj();
              break a;
            }
            k2 = Error(p$1(426));
          }
        } else if (I && h.mode & 1) {
          var J2 = Ui(g);
          if (null !== J2) {
            0 === (J2.flags & 65536) && (J2.flags |= 256);
            Vi(J2, g, h, f2, b);
            Jg(Ji(k2, h));
            break a;
          }
        }
        f2 = k2 = Ji(k2, h);
        4 !== T && (T = 2);
        null === sk ? sk = [f2] : sk.push(f2);
        f2 = g;
        do {
          switch (f2.tag) {
            case 3:
              f2.flags |= 65536;
              b &= -b;
              f2.lanes |= b;
              var x2 = Ni(f2, k2, b);
              ph(f2, x2);
              break a;
            case 1:
              h = k2;
              var w2 = f2.type, u2 = f2.stateNode;
              if (0 === (f2.flags & 128) && ("function" === typeof w2.getDerivedStateFromError || null !== u2 && "function" === typeof u2.componentDidCatch && (null === Ri || !Ri.has(u2)))) {
                f2.flags |= 65536;
                b &= -b;
                f2.lanes |= b;
                var F2 = Qi(f2, h, b);
                ph(f2, F2);
                break a;
              }
          }
          f2 = f2.return;
        } while (null !== f2);
      }
      Sk(c);
    } catch (na) {
      b = na;
      Y === c && null !== c && (Y = c = c.return);
      continue;
    }
    break;
  } while (1);
}
function Jk() {
  var a = mk.current;
  mk.current = Rh;
  return null === a ? Rh : a;
}
function tj() {
  if (0 === T || 3 === T || 2 === T)
    T = 4;
  null === Q || 0 === (rh & 268435455) && 0 === (qk & 268435455) || Ck(Q, Z);
}
function Ik(a, b) {
  var c = K;
  K |= 2;
  var d = Jk();
  if (Q !== a || Z !== b)
    uk = null, Kk(a, b);
  do
    try {
      Tk();
      break;
    } catch (e) {
      Mk(a, e);
    }
  while (1);
  $g();
  K = c;
  mk.current = d;
  if (null !== Y)
    throw Error(p$1(261));
  Q = null;
  Z = 0;
  return T;
}
function Tk() {
  for (; null !== Y; )
    Uk(Y);
}
function Lk() {
  for (; null !== Y && !cc(); )
    Uk(Y);
}
function Uk(a) {
  var b = Vk(a.alternate, a, fj);
  a.memoizedProps = a.pendingProps;
  null === b ? Sk(a) : Y = b;
  nk.current = null;
}
function Sk(a) {
  var b = a;
  do {
    var c = b.alternate;
    a = b.return;
    if (0 === (b.flags & 32768)) {
      if (c = Ej(c, b, fj), null !== c) {
        Y = c;
        return;
      }
    } else {
      c = Ij(c, b);
      if (null !== c) {
        c.flags &= 32767;
        Y = c;
        return;
      }
      if (null !== a)
        a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null;
      else {
        T = 6;
        Y = null;
        return;
      }
    }
    b = b.sibling;
    if (null !== b) {
      Y = b;
      return;
    }
    Y = b = a;
  } while (null !== b);
  0 === T && (T = 5);
}
function Pk(a, b, c) {
  var d = C, e = ok.transition;
  try {
    ok.transition = null, C = 1, Wk(a, b, c, d);
  } finally {
    ok.transition = e, C = d;
  }
  return null;
}
function Wk(a, b, c, d) {
  do
    Hk();
  while (null !== wk);
  if (0 !== (K & 6))
    throw Error(p$1(327));
  c = a.finishedWork;
  var e = a.finishedLanes;
  if (null === c)
    return null;
  a.finishedWork = null;
  a.finishedLanes = 0;
  if (c === a.current)
    throw Error(p$1(177));
  a.callbackNode = null;
  a.callbackPriority = 0;
  var f2 = c.lanes | c.childLanes;
  Bc(a, f2);
  a === Q && (Y = Q = null, Z = 0);
  0 === (c.subtreeFlags & 2064) && 0 === (c.flags & 2064) || vk || (vk = true, Fk(hc, function() {
    Hk();
    return null;
  }));
  f2 = 0 !== (c.flags & 15990);
  if (0 !== (c.subtreeFlags & 15990) || f2) {
    f2 = ok.transition;
    ok.transition = null;
    var g = C;
    C = 1;
    var h = K;
    K |= 4;
    nk.current = null;
    Oj(a, c);
    dk(c, a);
    Oe(Df);
    dd = !!Cf;
    Df = Cf = null;
    a.current = c;
    hk(c);
    dc();
    K = h;
    C = g;
    ok.transition = f2;
  } else
    a.current = c;
  vk && (vk = false, wk = a, xk = e);
  f2 = a.pendingLanes;
  0 === f2 && (Ri = null);
  mc(c.stateNode);
  Dk(a, B());
  if (null !== b)
    for (d = a.onRecoverableError, c = 0; c < b.length; c++)
      e = b[c], d(e.value, { componentStack: e.stack, digest: e.digest });
  if (Oi)
    throw Oi = false, a = Pi, Pi = null, a;
  0 !== (xk & 1) && 0 !== a.tag && Hk();
  f2 = a.pendingLanes;
  0 !== (f2 & 1) ? a === zk ? yk++ : (yk = 0, zk = a) : yk = 0;
  jg();
  return null;
}
function Hk() {
  if (null !== wk) {
    var a = Dc(xk), b = ok.transition, c = C;
    try {
      ok.transition = null;
      C = 16 > a ? 16 : a;
      if (null === wk)
        var d = false;
      else {
        a = wk;
        wk = null;
        xk = 0;
        if (0 !== (K & 6))
          throw Error(p$1(331));
        var e = K;
        K |= 4;
        for (V = a.current; null !== V; ) {
          var f2 = V, g = f2.child;
          if (0 !== (V.flags & 16)) {
            var h = f2.deletions;
            if (null !== h) {
              for (var k2 = 0; k2 < h.length; k2++) {
                var l2 = h[k2];
                for (V = l2; null !== V; ) {
                  var m2 = V;
                  switch (m2.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Pj(8, m2, f2);
                  }
                  var q2 = m2.child;
                  if (null !== q2)
                    q2.return = m2, V = q2;
                  else
                    for (; null !== V; ) {
                      m2 = V;
                      var r2 = m2.sibling, y2 = m2.return;
                      Sj(m2);
                      if (m2 === l2) {
                        V = null;
                        break;
                      }
                      if (null !== r2) {
                        r2.return = y2;
                        V = r2;
                        break;
                      }
                      V = y2;
                    }
                }
              }
              var n2 = f2.alternate;
              if (null !== n2) {
                var t2 = n2.child;
                if (null !== t2) {
                  n2.child = null;
                  do {
                    var J2 = t2.sibling;
                    t2.sibling = null;
                    t2 = J2;
                  } while (null !== t2);
                }
              }
              V = f2;
            }
          }
          if (0 !== (f2.subtreeFlags & 2064) && null !== g)
            g.return = f2, V = g;
          else
            b:
              for (; null !== V; ) {
                f2 = V;
                if (0 !== (f2.flags & 2048))
                  switch (f2.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Pj(9, f2, f2.return);
                  }
                var x2 = f2.sibling;
                if (null !== x2) {
                  x2.return = f2.return;
                  V = x2;
                  break b;
                }
                V = f2.return;
              }
        }
        var w2 = a.current;
        for (V = w2; null !== V; ) {
          g = V;
          var u2 = g.child;
          if (0 !== (g.subtreeFlags & 2064) && null !== u2)
            u2.return = g, V = u2;
          else
            b:
              for (g = w2; null !== V; ) {
                h = V;
                if (0 !== (h.flags & 2048))
                  try {
                    switch (h.tag) {
                      case 0:
                      case 11:
                      case 15:
                        Qj(9, h);
                    }
                  } catch (na) {
                    W(h, h.return, na);
                  }
                if (h === g) {
                  V = null;
                  break b;
                }
                var F2 = h.sibling;
                if (null !== F2) {
                  F2.return = h.return;
                  V = F2;
                  break b;
                }
                V = h.return;
              }
        }
        K = e;
        jg();
        if (lc && "function" === typeof lc.onPostCommitFiberRoot)
          try {
            lc.onPostCommitFiberRoot(kc, a);
          } catch (na) {
          }
        d = true;
      }
      return d;
    } finally {
      C = c, ok.transition = b;
    }
  }
  return false;
}
function Xk(a, b, c) {
  b = Ji(c, b);
  b = Ni(a, b, 1);
  a = nh(a, b, 1);
  b = R();
  null !== a && (Ac(a, 1, b), Dk(a, b));
}
function W(a, b, c) {
  if (3 === a.tag)
    Xk(a, a, c);
  else
    for (; null !== b; ) {
      if (3 === b.tag) {
        Xk(b, a, c);
        break;
      } else if (1 === b.tag) {
        var d = b.stateNode;
        if ("function" === typeof b.type.getDerivedStateFromError || "function" === typeof d.componentDidCatch && (null === Ri || !Ri.has(d))) {
          a = Ji(c, a);
          a = Qi(b, a, 1);
          b = nh(b, a, 1);
          a = R();
          null !== b && (Ac(b, 1, a), Dk(b, a));
          break;
        }
      }
      b = b.return;
    }
}
function Ti(a, b, c) {
  var d = a.pingCache;
  null !== d && d.delete(b);
  b = R();
  a.pingedLanes |= a.suspendedLanes & c;
  Q === a && (Z & c) === c && (4 === T || 3 === T && (Z & 130023424) === Z && 500 > B() - fk ? Kk(a, 0) : rk |= c);
  Dk(a, b);
}
function Yk(a, b) {
  0 === b && (0 === (a.mode & 1) ? b = 1 : (b = sc, sc <<= 1, 0 === (sc & 130023424) && (sc = 4194304)));
  var c = R();
  a = ih(a, b);
  null !== a && (Ac(a, b, c), Dk(a, c));
}
function uj(a) {
  var b = a.memoizedState, c = 0;
  null !== b && (c = b.retryLane);
  Yk(a, c);
}
function bk(a, b) {
  var c = 0;
  switch (a.tag) {
    case 13:
      var d = a.stateNode;
      var e = a.memoizedState;
      null !== e && (c = e.retryLane);
      break;
    case 19:
      d = a.stateNode;
      break;
    default:
      throw Error(p$1(314));
  }
  null !== d && d.delete(b);
  Yk(a, c);
}
var Vk;
Vk = function(a, b, c) {
  if (null !== a)
    if (a.memoizedProps !== b.pendingProps || Wf.current)
      dh = true;
    else {
      if (0 === (a.lanes & c) && 0 === (b.flags & 128))
        return dh = false, yj(a, b, c);
      dh = 0 !== (a.flags & 131072) ? true : false;
    }
  else
    dh = false, I && 0 !== (b.flags & 1048576) && ug(b, ng, b.index);
  b.lanes = 0;
  switch (b.tag) {
    case 2:
      var d = b.type;
      ij(a, b);
      a = b.pendingProps;
      var e = Yf(b, H.current);
      ch(b, c);
      e = Nh(null, b, d, a, e, c);
      var f2 = Sh();
      b.flags |= 1;
      "object" === typeof e && null !== e && "function" === typeof e.render && void 0 === e.$$typeof ? (b.tag = 1, b.memoizedState = null, b.updateQueue = null, Zf(d) ? (f2 = true, cg(b)) : f2 = false, b.memoizedState = null !== e.state && void 0 !== e.state ? e.state : null, kh(b), e.updater = Ei, b.stateNode = e, e._reactInternals = b, Ii(b, d, a, c), b = jj(null, b, d, true, f2, c)) : (b.tag = 0, I && f2 && vg(b), Xi(null, b, e, c), b = b.child);
      return b;
    case 16:
      d = b.elementType;
      a: {
        ij(a, b);
        a = b.pendingProps;
        e = d._init;
        d = e(d._payload);
        b.type = d;
        e = b.tag = Zk(d);
        a = Ci(d, a);
        switch (e) {
          case 0:
            b = cj(null, b, d, a, c);
            break a;
          case 1:
            b = hj(null, b, d, a, c);
            break a;
          case 11:
            b = Yi(null, b, d, a, c);
            break a;
          case 14:
            b = $i(null, b, d, Ci(d.type, a), c);
            break a;
        }
        throw Error(p$1(
          306,
          d,
          ""
        ));
      }
      return b;
    case 0:
      return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), cj(a, b, d, e, c);
    case 1:
      return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), hj(a, b, d, e, c);
    case 3:
      a: {
        kj(b);
        if (null === a)
          throw Error(p$1(387));
        d = b.pendingProps;
        f2 = b.memoizedState;
        e = f2.element;
        lh(a, b);
        qh(b, d, null, c);
        var g = b.memoizedState;
        d = g.element;
        if (f2.isDehydrated)
          if (f2 = { element: d, isDehydrated: false, cache: g.cache, pendingSuspenseBoundaries: g.pendingSuspenseBoundaries, transitions: g.transitions }, b.updateQueue.baseState = f2, b.memoizedState = f2, b.flags & 256) {
            e = Ji(Error(p$1(423)), b);
            b = lj(a, b, d, c, e);
            break a;
          } else if (d !== e) {
            e = Ji(Error(p$1(424)), b);
            b = lj(a, b, d, c, e);
            break a;
          } else
            for (yg = Lf(b.stateNode.containerInfo.firstChild), xg = b, I = true, zg = null, c = Vg(b, null, d, c), b.child = c; c; )
              c.flags = c.flags & -3 | 4096, c = c.sibling;
        else {
          Ig();
          if (d === e) {
            b = Zi(a, b, c);
            break a;
          }
          Xi(a, b, d, c);
        }
        b = b.child;
      }
      return b;
    case 5:
      return Ah(b), null === a && Eg(b), d = b.type, e = b.pendingProps, f2 = null !== a ? a.memoizedProps : null, g = e.children, Ef(d, e) ? g = null : null !== f2 && Ef(d, f2) && (b.flags |= 32), gj(a, b), Xi(a, b, g, c), b.child;
    case 6:
      return null === a && Eg(b), null;
    case 13:
      return oj(a, b, c);
    case 4:
      return yh(b, b.stateNode.containerInfo), d = b.pendingProps, null === a ? b.child = Ug(b, null, d, c) : Xi(a, b, d, c), b.child;
    case 11:
      return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), Yi(a, b, d, e, c);
    case 7:
      return Xi(a, b, b.pendingProps, c), b.child;
    case 8:
      return Xi(a, b, b.pendingProps.children, c), b.child;
    case 12:
      return Xi(a, b, b.pendingProps.children, c), b.child;
    case 10:
      a: {
        d = b.type._context;
        e = b.pendingProps;
        f2 = b.memoizedProps;
        g = e.value;
        G(Wg, d._currentValue);
        d._currentValue = g;
        if (null !== f2)
          if (He(f2.value, g)) {
            if (f2.children === e.children && !Wf.current) {
              b = Zi(a, b, c);
              break a;
            }
          } else
            for (f2 = b.child, null !== f2 && (f2.return = b); null !== f2; ) {
              var h = f2.dependencies;
              if (null !== h) {
                g = f2.child;
                for (var k2 = h.firstContext; null !== k2; ) {
                  if (k2.context === d) {
                    if (1 === f2.tag) {
                      k2 = mh(-1, c & -c);
                      k2.tag = 2;
                      var l2 = f2.updateQueue;
                      if (null !== l2) {
                        l2 = l2.shared;
                        var m2 = l2.pending;
                        null === m2 ? k2.next = k2 : (k2.next = m2.next, m2.next = k2);
                        l2.pending = k2;
                      }
                    }
                    f2.lanes |= c;
                    k2 = f2.alternate;
                    null !== k2 && (k2.lanes |= c);
                    bh(
                      f2.return,
                      c,
                      b
                    );
                    h.lanes |= c;
                    break;
                  }
                  k2 = k2.next;
                }
              } else if (10 === f2.tag)
                g = f2.type === b.type ? null : f2.child;
              else if (18 === f2.tag) {
                g = f2.return;
                if (null === g)
                  throw Error(p$1(341));
                g.lanes |= c;
                h = g.alternate;
                null !== h && (h.lanes |= c);
                bh(g, c, b);
                g = f2.sibling;
              } else
                g = f2.child;
              if (null !== g)
                g.return = f2;
              else
                for (g = f2; null !== g; ) {
                  if (g === b) {
                    g = null;
                    break;
                  }
                  f2 = g.sibling;
                  if (null !== f2) {
                    f2.return = g.return;
                    g = f2;
                    break;
                  }
                  g = g.return;
                }
              f2 = g;
            }
        Xi(a, b, e.children, c);
        b = b.child;
      }
      return b;
    case 9:
      return e = b.type, d = b.pendingProps.children, ch(b, c), e = eh(e), d = d(e), b.flags |= 1, Xi(a, b, d, c), b.child;
    case 14:
      return d = b.type, e = Ci(d, b.pendingProps), e = Ci(d.type, e), $i(a, b, d, e, c);
    case 15:
      return bj(a, b, b.type, b.pendingProps, c);
    case 17:
      return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), ij(a, b), b.tag = 1, Zf(d) ? (a = true, cg(b)) : a = false, ch(b, c), Gi(b, d, e), Ii(b, d, e, c), jj(null, b, d, true, a, c);
    case 19:
      return xj(a, b, c);
    case 22:
      return dj(a, b, c);
  }
  throw Error(p$1(156, b.tag));
};
function Fk(a, b) {
  return ac(a, b);
}
function $k(a, b, c, d) {
  this.tag = a;
  this.key = c;
  this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
  this.index = 0;
  this.ref = null;
  this.pendingProps = b;
  this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
  this.mode = d;
  this.subtreeFlags = this.flags = 0;
  this.deletions = null;
  this.childLanes = this.lanes = 0;
  this.alternate = null;
}
function Bg(a, b, c, d) {
  return new $k(a, b, c, d);
}
function aj(a) {
  a = a.prototype;
  return !(!a || !a.isReactComponent);
}
function Zk(a) {
  if ("function" === typeof a)
    return aj(a) ? 1 : 0;
  if (void 0 !== a && null !== a) {
    a = a.$$typeof;
    if (a === Da)
      return 11;
    if (a === Ga)
      return 14;
  }
  return 2;
}
function Pg(a, b) {
  var c = a.alternate;
  null === c ? (c = Bg(a.tag, b, a.key, a.mode), c.elementType = a.elementType, c.type = a.type, c.stateNode = a.stateNode, c.alternate = a, a.alternate = c) : (c.pendingProps = b, c.type = a.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null);
  c.flags = a.flags & 14680064;
  c.childLanes = a.childLanes;
  c.lanes = a.lanes;
  c.child = a.child;
  c.memoizedProps = a.memoizedProps;
  c.memoizedState = a.memoizedState;
  c.updateQueue = a.updateQueue;
  b = a.dependencies;
  c.dependencies = null === b ? null : { lanes: b.lanes, firstContext: b.firstContext };
  c.sibling = a.sibling;
  c.index = a.index;
  c.ref = a.ref;
  return c;
}
function Rg(a, b, c, d, e, f2) {
  var g = 2;
  d = a;
  if ("function" === typeof a)
    aj(a) && (g = 1);
  else if ("string" === typeof a)
    g = 5;
  else
    a:
      switch (a) {
        case ya:
          return Tg(c.children, e, f2, b);
        case za:
          g = 8;
          e |= 8;
          break;
        case Aa:
          return a = Bg(12, c, b, e | 2), a.elementType = Aa, a.lanes = f2, a;
        case Ea:
          return a = Bg(13, c, b, e), a.elementType = Ea, a.lanes = f2, a;
        case Fa:
          return a = Bg(19, c, b, e), a.elementType = Fa, a.lanes = f2, a;
        case Ia:
          return pj(c, e, f2, b);
        default:
          if ("object" === typeof a && null !== a)
            switch (a.$$typeof) {
              case Ba:
                g = 10;
                break a;
              case Ca:
                g = 9;
                break a;
              case Da:
                g = 11;
                break a;
              case Ga:
                g = 14;
                break a;
              case Ha:
                g = 16;
                d = null;
                break a;
            }
          throw Error(p$1(130, null == a ? a : typeof a, ""));
      }
  b = Bg(g, c, b, e);
  b.elementType = a;
  b.type = d;
  b.lanes = f2;
  return b;
}
function Tg(a, b, c, d) {
  a = Bg(7, a, d, b);
  a.lanes = c;
  return a;
}
function pj(a, b, c, d) {
  a = Bg(22, a, d, b);
  a.elementType = Ia;
  a.lanes = c;
  a.stateNode = { isHidden: false };
  return a;
}
function Qg(a, b, c) {
  a = Bg(6, a, null, b);
  a.lanes = c;
  return a;
}
function Sg(a, b, c) {
  b = Bg(4, null !== a.children ? a.children : [], a.key, b);
  b.lanes = c;
  b.stateNode = { containerInfo: a.containerInfo, pendingChildren: null, implementation: a.implementation };
  return b;
}
function al(a, b, c, d, e) {
  this.tag = b;
  this.containerInfo = a;
  this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
  this.timeoutHandle = -1;
  this.callbackNode = this.pendingContext = this.context = null;
  this.callbackPriority = 0;
  this.eventTimes = zc(0);
  this.expirationTimes = zc(-1);
  this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
  this.entanglements = zc(0);
  this.identifierPrefix = d;
  this.onRecoverableError = e;
  this.mutableSourceEagerHydrationData = null;
}
function bl(a, b, c, d, e, f2, g, h, k2) {
  a = new al(a, b, c, h, k2);
  1 === b ? (b = 1, true === f2 && (b |= 8)) : b = 0;
  f2 = Bg(3, null, null, b);
  a.current = f2;
  f2.stateNode = a;
  f2.memoizedState = { element: d, isDehydrated: c, cache: null, transitions: null, pendingSuspenseBoundaries: null };
  kh(f2);
  return a;
}
function cl(a, b, c) {
  var d = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
  return { $$typeof: wa, key: null == d ? null : "" + d, children: a, containerInfo: b, implementation: c };
}
function dl(a) {
  if (!a)
    return Vf;
  a = a._reactInternals;
  a: {
    if (Vb(a) !== a || 1 !== a.tag)
      throw Error(p$1(170));
    var b = a;
    do {
      switch (b.tag) {
        case 3:
          b = b.stateNode.context;
          break a;
        case 1:
          if (Zf(b.type)) {
            b = b.stateNode.__reactInternalMemoizedMergedChildContext;
            break a;
          }
      }
      b = b.return;
    } while (null !== b);
    throw Error(p$1(171));
  }
  if (1 === a.tag) {
    var c = a.type;
    if (Zf(c))
      return bg(a, c, b);
  }
  return b;
}
function el(a, b, c, d, e, f2, g, h, k2) {
  a = bl(c, d, true, a, e, f2, g, h, k2);
  a.context = dl(null);
  c = a.current;
  d = R();
  e = yi(c);
  f2 = mh(d, e);
  f2.callback = void 0 !== b && null !== b ? b : null;
  nh(c, f2, e);
  a.current.lanes = e;
  Ac(a, e, d);
  Dk(a, d);
  return a;
}
function fl(a, b, c, d) {
  var e = b.current, f2 = R(), g = yi(e);
  c = dl(c);
  null === b.context ? b.context = c : b.pendingContext = c;
  b = mh(f2, g);
  b.payload = { element: a };
  d = void 0 === d ? null : d;
  null !== d && (b.callback = d);
  a = nh(e, b, g);
  null !== a && (gi(a, e, g, f2), oh(a, e, g));
  return g;
}
function gl(a) {
  a = a.current;
  if (!a.child)
    return null;
  switch (a.child.tag) {
    case 5:
      return a.child.stateNode;
    default:
      return a.child.stateNode;
  }
}
function hl(a, b) {
  a = a.memoizedState;
  if (null !== a && null !== a.dehydrated) {
    var c = a.retryLane;
    a.retryLane = 0 !== c && c < b ? c : b;
  }
}
function il(a, b) {
  hl(a, b);
  (a = a.alternate) && hl(a, b);
}
function jl() {
  return null;
}
var kl = "function" === typeof reportError ? reportError : function(a) {
  console.error(a);
};
function ll(a) {
  this._internalRoot = a;
}
ml.prototype.render = ll.prototype.render = function(a) {
  var b = this._internalRoot;
  if (null === b)
    throw Error(p$1(409));
  fl(a, b, null, null);
};
ml.prototype.unmount = ll.prototype.unmount = function() {
  var a = this._internalRoot;
  if (null !== a) {
    this._internalRoot = null;
    var b = a.containerInfo;
    Rk(function() {
      fl(null, a, null, null);
    });
    b[uf] = null;
  }
};
function ml(a) {
  this._internalRoot = a;
}
ml.prototype.unstable_scheduleHydration = function(a) {
  if (a) {
    var b = Hc();
    a = { blockedOn: null, target: a, priority: b };
    for (var c = 0; c < Qc.length && 0 !== b && b < Qc[c].priority; c++)
      ;
    Qc.splice(c, 0, a);
    0 === c && Vc(a);
  }
};
function nl(a) {
  return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType);
}
function ol(a) {
  return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType && (8 !== a.nodeType || " react-mount-point-unstable " !== a.nodeValue));
}
function pl() {
}
function ql(a, b, c, d, e) {
  if (e) {
    if ("function" === typeof d) {
      var f2 = d;
      d = function() {
        var a2 = gl(g);
        f2.call(a2);
      };
    }
    var g = el(b, d, a, 0, null, false, false, "", pl);
    a._reactRootContainer = g;
    a[uf] = g.current;
    sf(8 === a.nodeType ? a.parentNode : a);
    Rk();
    return g;
  }
  for (; e = a.lastChild; )
    a.removeChild(e);
  if ("function" === typeof d) {
    var h = d;
    d = function() {
      var a2 = gl(k2);
      h.call(a2);
    };
  }
  var k2 = bl(a, 0, false, null, null, false, false, "", pl);
  a._reactRootContainer = k2;
  a[uf] = k2.current;
  sf(8 === a.nodeType ? a.parentNode : a);
  Rk(function() {
    fl(b, k2, c, d);
  });
  return k2;
}
function rl(a, b, c, d, e) {
  var f2 = c._reactRootContainer;
  if (f2) {
    var g = f2;
    if ("function" === typeof e) {
      var h = e;
      e = function() {
        var a2 = gl(g);
        h.call(a2);
      };
    }
    fl(b, g, a, e);
  } else
    g = ql(c, b, a, e, d);
  return gl(g);
}
Ec = function(a) {
  switch (a.tag) {
    case 3:
      var b = a.stateNode;
      if (b.current.memoizedState.isDehydrated) {
        var c = tc(b.pendingLanes);
        0 !== c && (Cc(b, c | 1), Dk(b, B()), 0 === (K & 6) && (Gj = B() + 500, jg()));
      }
      break;
    case 13:
      Rk(function() {
        var b2 = ih(a, 1);
        if (null !== b2) {
          var c2 = R();
          gi(b2, a, 1, c2);
        }
      }), il(a, 1);
  }
};
Fc = function(a) {
  if (13 === a.tag) {
    var b = ih(a, 134217728);
    if (null !== b) {
      var c = R();
      gi(b, a, 134217728, c);
    }
    il(a, 134217728);
  }
};
Gc = function(a) {
  if (13 === a.tag) {
    var b = yi(a), c = ih(a, b);
    if (null !== c) {
      var d = R();
      gi(c, a, b, d);
    }
    il(a, b);
  }
};
Hc = function() {
  return C;
};
Ic = function(a, b) {
  var c = C;
  try {
    return C = a, b();
  } finally {
    C = c;
  }
};
yb = function(a, b, c) {
  switch (b) {
    case "input":
      bb(a, c);
      b = c.name;
      if ("radio" === c.type && null != b) {
        for (c = a; c.parentNode; )
          c = c.parentNode;
        c = c.querySelectorAll("input[name=" + JSON.stringify("" + b) + '][type="radio"]');
        for (b = 0; b < c.length; b++) {
          var d = c[b];
          if (d !== a && d.form === a.form) {
            var e = Db(d);
            if (!e)
              throw Error(p$1(90));
            Wa(d);
            bb(d, e);
          }
        }
      }
      break;
    case "textarea":
      ib(a, c);
      break;
    case "select":
      b = c.value, null != b && fb(a, !!c.multiple, b, false);
  }
};
Gb = Qk;
Hb = Rk;
var sl = { usingClientEntryPoint: false, Events: [Cb, ue, Db, Eb, Fb, Qk] }, tl = { findFiberByHostInstance: Wc, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" };
var ul = { bundleType: tl.bundleType, version: tl.version, rendererPackageName: tl.rendererPackageName, rendererConfig: tl.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: ua.ReactCurrentDispatcher, findHostInstanceByFiber: function(a) {
  a = Zb(a);
  return null === a ? null : a.stateNode;
}, findFiberByHostInstance: tl.findFiberByHostInstance || jl, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
  var vl = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!vl.isDisabled && vl.supportsFiber)
    try {
      kc = vl.inject(ul), lc = vl;
    } catch (a) {
    }
}
reactDom_production_min.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = sl;
reactDom_production_min.createPortal = function(a, b) {
  var c = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
  if (!nl(b))
    throw Error(p$1(200));
  return cl(a, b, null, c);
};
reactDom_production_min.createRoot = function(a, b) {
  if (!nl(a))
    throw Error(p$1(299));
  var c = false, d = "", e = kl;
  null !== b && void 0 !== b && (true === b.unstable_strictMode && (c = true), void 0 !== b.identifierPrefix && (d = b.identifierPrefix), void 0 !== b.onRecoverableError && (e = b.onRecoverableError));
  b = bl(a, 1, false, null, null, c, false, d, e);
  a[uf] = b.current;
  sf(8 === a.nodeType ? a.parentNode : a);
  return new ll(b);
};
reactDom_production_min.findDOMNode = function(a) {
  if (null == a)
    return null;
  if (1 === a.nodeType)
    return a;
  var b = a._reactInternals;
  if (void 0 === b) {
    if ("function" === typeof a.render)
      throw Error(p$1(188));
    a = Object.keys(a).join(",");
    throw Error(p$1(268, a));
  }
  a = Zb(b);
  a = null === a ? null : a.stateNode;
  return a;
};
reactDom_production_min.flushSync = function(a) {
  return Rk(a);
};
reactDom_production_min.hydrate = function(a, b, c) {
  if (!ol(b))
    throw Error(p$1(200));
  return rl(null, a, b, true, c);
};
reactDom_production_min.hydrateRoot = function(a, b, c) {
  if (!nl(a))
    throw Error(p$1(405));
  var d = null != c && c.hydratedSources || null, e = false, f2 = "", g = kl;
  null !== c && void 0 !== c && (true === c.unstable_strictMode && (e = true), void 0 !== c.identifierPrefix && (f2 = c.identifierPrefix), void 0 !== c.onRecoverableError && (g = c.onRecoverableError));
  b = el(b, null, a, 1, null != c ? c : null, e, false, f2, g);
  a[uf] = b.current;
  sf(a);
  if (d)
    for (a = 0; a < d.length; a++)
      c = d[a], e = c._getVersion, e = e(c._source), null == b.mutableSourceEagerHydrationData ? b.mutableSourceEagerHydrationData = [c, e] : b.mutableSourceEagerHydrationData.push(
        c,
        e
      );
  return new ml(b);
};
reactDom_production_min.render = function(a, b, c) {
  if (!ol(b))
    throw Error(p$1(200));
  return rl(null, a, b, false, c);
};
reactDom_production_min.unmountComponentAtNode = function(a) {
  if (!ol(a))
    throw Error(p$1(40));
  return a._reactRootContainer ? (Rk(function() {
    rl(null, null, a, false, function() {
      a._reactRootContainer = null;
      a[uf] = null;
    });
  }), true) : false;
};
reactDom_production_min.unstable_batchedUpdates = Qk;
reactDom_production_min.unstable_renderSubtreeIntoContainer = function(a, b, c, d) {
  if (!ol(c))
    throw Error(p$1(200));
  if (null == a || void 0 === a._reactInternals)
    throw Error(p$1(38));
  return rl(a, b, c, false, d);
};
reactDom_production_min.version = "18.3.1-next-f1338f8080-20240426";
function checkDCE() {
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
    return;
  }
  try {
    __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
  } catch (err) {
    console.error(err);
  }
}
{
  checkDCE();
  reactDom.exports = reactDom_production_min;
}
var reactDomExports = reactDom.exports;
var hydrateRoot;
var createRoot;
var m$1 = reactDomExports;
{
  createRoot = m$1.createRoot;
  hydrateRoot = m$1.hydrateRoot;
}
var jsxRuntime = { exports: {} };
var reactJsxRuntime_production_min = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var f = reactExports, k = Symbol.for("react.element"), l = Symbol.for("react.fragment"), m = Object.prototype.hasOwnProperty, n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, p = { key: true, ref: true, __self: true, __source: true };
function q(c, a, g) {
  var b, d = {}, e = null, h = null;
  void 0 !== g && (e = "" + g);
  void 0 !== a.key && (e = "" + a.key);
  void 0 !== a.ref && (h = a.ref);
  for (b in a)
    m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
  if (c && c.defaultProps)
    for (b in a = c.defaultProps, a)
      void 0 === d[b] && (d[b] = a[b]);
  return { $$typeof: k, type: c, key: e, ref: h, props: d, _owner: n.current };
}
reactJsxRuntime_production_min.Fragment = l;
reactJsxRuntime_production_min.jsx = q;
reactJsxRuntime_production_min.jsxs = q;
{
  jsxRuntime.exports = reactJsxRuntime_production_min;
}
var jsxRuntimeExports = jsxRuntime.exports;
function formatMatchMessage(originalScore = 0, enhancedScore = 0) {
  const likelihood = enhancedScore >= 80 ? "High" : enhancedScore >= 50 ? "Medium" : "Low";
  if (enhancedScore > originalScore) {
    return `JD skill coverage improved from ${originalScore}% to ${enhancedScore}%, indicating a ${likelihood} selection likelihood.`;
  }
  return `JD skill coverage remains at ${enhancedScore}%, indicating a ${likelihood} selection likelihood.`;
}
const CLOUD_FRONT_HOST = /\.cloudfront\.net$/i;
function normalizePath(pathname = "") {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/")
    return "";
  return trimmed.replace(/\/+$/u, "");
}
function resolveApiBase(rawBaseUrl) {
  if (typeof window === "undefined") {
    return (rawBaseUrl || "").trim();
  }
  const globalOverride = typeof window.__RESUMEFORGE_API_BASE_URL__ === "string" ? window.__RESUMEFORGE_API_BASE_URL__.trim() : "";
  const candidate = (globalOverride || rawBaseUrl || "").trim();
  if (!candidate || candidate === "/" || candidate === "undefined" || candidate === "null") {
    return "";
  }
  const cleanedCandidate = candidate.replace(/\s+/gu, "");
  try {
    const url = new URL(cleanedCandidate, window.location.origin);
    const normalizedPath = normalizePath(url.pathname);
    const locationPath = normalizePath(window.location.pathname);
    const atRoot = !locationPath;
    const matchesHost = url.hostname === window.location.hostname;
    const looksLikeCloudFront = CLOUD_FRONT_HOST.test(url.hostname);
    if (atRoot && matchesHost && !normalizedPath) {
      return url.origin;
    }
    if (looksLikeCloudFront && normalizedPath) {
      return `${url.origin}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
    }
    return `${url.origin}${normalizedPath ? normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}` : ""}`;
  } catch {
    if (cleanedCandidate.startsWith("/")) {
      return cleanedCandidate.replace(/\/+$/u, "");
    }
    return cleanedCandidate;
  }
}
function buildApiUrl(base, path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    return normalizedPath;
  }
  if (/^https?:\/\//iu.test(base)) {
    const url = new URL(base);
    const prefix = normalizePath(url.pathname);
    const fullPath = `${prefix}${normalizedPath}`;
    url.pathname = fullPath;
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  const normalizedBase = base.startsWith("/") ? base : `/${base}`;
  return `${normalizedBase.replace(/\/+$/u, "")}${normalizedPath}`;
}
const variantThemes = {
  dark: {
    bubble: "bg-slate-900/95 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)] ring-1 ring-white/10",
    trigger: "text-white/90 border-white/40 bg-white/15 hover:bg-white/25 focus-visible:ring-white/60"
  },
  light: {
    bubble: "bg-white text-slate-700 shadow-[0_20px_45px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/70",
    trigger: "text-slate-600 border-slate-300 bg-white/90 hover:bg-white focus-visible:ring-slate-400/70"
  }
};
function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function hashString(value) {
  let hash = 0;
  for (let index2 = 0; index2 < value.length; index2 += 1) {
    const char = value.charCodeAt(index2);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
function InfoTooltip({
  label = "Show explanation",
  content,
  className = "",
  align = "left",
  variant = "dark",
  maxWidthClass = "w-64"
}) {
  const [open, setOpen] = reactExports.useState(false);
  const tooltipId = reactExports.useMemo(() => {
    const baseLabel = typeof label === "string" ? label.trim() : "";
    const labelSlug = baseLabel ? slugify(baseLabel) : "tooltip";
    const contentKey = typeof content === "string" && content.trim().length > 0 ? hashString(content.trim()) : "";
    return `rf-tooltip-${labelSlug}${contentKey ? `-${contentKey}` : ""}`;
  }, [label, content]);
  const theme = variantThemes[variant] || variantThemes.dark;
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `relative inline-flex${className ? ` ${className}` : ""}`,
      onMouseLeave: hide,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            "aria-label": label,
            "aria-describedby": tooltipId,
            onMouseEnter: show,
            onFocus: show,
            onBlur: hide,
            className: `inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${theme.trigger}`,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "i" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            id: tooltipId,
            role: "tooltip",
            "aria-hidden": !open,
            className: `pointer-events-none absolute z-40 mt-2 ${align === "left" ? "left-0" : "right-0"} top-full origin-top ${maxWidthClass} rounded-xl px-4 py-3 text-left text-xs font-medium leading-relaxed backdrop-blur transition-all duration-150 ${theme.bubble} ${open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`,
            children: content
          }
        )
      ]
    }
  );
}
const ACTION_TYPE_PATTERNS = [
  { type: "skills", regex: /skill|keyword|competenc/i },
  { type: "designation", regex: /designation|title|headline|role/i },
  { type: "experience", regex: /experience|impact|achievement|project|highlight|story/i },
  { type: "summary", regex: /summary|profile|overview/i },
  { type: "certificates", regex: /cert|badge|credential/i },
  { type: "format", regex: /format|layout|structure|readability|crisp/i }
];
function normaliseString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : "";
  }
  if (value === null || value === void 0) {
    return "";
  }
  return String(value || "").trim();
}
function normaliseActionList$1(items) {
  if (!Array.isArray(items))
    return [];
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  items.forEach((item) => {
    const text = normaliseString(item);
    if (!text)
      return;
    const key = text.toLowerCase();
    if (seen.has(key))
      return;
    seen.add(key);
    output.push(text);
  });
  return output;
}
function formatActionList$1(items) {
  const list = normaliseActionList$1(items);
  if (list.length === 0)
    return "";
  if (list.length === 1)
    return list[0];
  if (list.length === 2)
    return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}
function inferActionType$1(source, fallback = "general") {
  const text = normaliseString(source);
  if (!text)
    return fallback;
  const lower = text.toLowerCase();
  const directMap = {
    skills: "skills",
    keywords: "skills",
    designation: "designation",
    certificates: "certificates",
    experience: "experience",
    tasks: "experience",
    highlights: "summary"
  };
  if (directMap[lower]) {
    return directMap[lower];
  }
  const match = ACTION_TYPE_PATTERNS.find((pattern) => pattern.regex.test(lower));
  return match ? match.type : fallback;
}
function buildSkillsAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList$1(added);
  const missingText = formatActionList$1(missing.length ? missing : removed);
  if (missingText && addedText) {
    return `Add these skills next: ${missingText}. Keep spotlighting ${addedText}.`;
  }
  if (missingText) {
    return `Add these skills next: ${missingText}.`;
  }
  if (addedText) {
    return `Keep spotlighting these skills: ${addedText}.`;
  }
  return "Keep mirroring the JD skill keywords in upcoming drafts.";
}
function buildExperienceAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList$1(added);
  const missingText = formatActionList$1(missing.length ? missing : removed);
  if (addedText && missingText) {
    return `Expand these highlights: ${addedText}. Refresh the stories covering ${missingText}.`;
  }
  if (addedText) {
    return `Expand these highlights: ${addedText}.`;
  }
  if (missingText) {
    return `Refresh the stories covering ${missingText}.`;
  }
  return "Continue backing experience bullets with quantified impact.";
}
function buildDesignationAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList$1(added);
  const missingText = formatActionList$1(missing.length ? missing : removed);
  if (addedText && missingText) {
    return `Change your last designation from ${missingText} to ${addedText} so the ATS reads the target title.`;
  }
  if (addedText) {
    return `Change your last designation to ${addedText} to mirror the job post.`;
  }
  if (missingText) {
    return `Retire the ${missingText} title so your headline matches the role.`;
  }
  return "Keep the job title aligned with the role you are pursuing.";
}
function buildSummaryAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList$1(added);
  const missingText = formatActionList$1(missing.length ? missing : removed);
  if (addedText && missingText) {
    return `Surface these summary hooks: ${addedText}. Phase out ${missingText} for clarity.`;
  }
  if (addedText) {
    return `Surface these summary hooks: ${addedText}.`;
  }
  if (missingText) {
    return `Trim ${missingText} from the summary to stay concise.`;
  }
  return "Lead with a sharp summary that mirrors the role’s priorities.";
}
function buildCertificateAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList$1(added);
  const missingText = formatActionList$1(missing.length ? missing : removed);
  if (missingText && addedText) {
    return `Log these certificates next: ${missingText}. Highlight ${addedText} near your summary.`;
  }
  if (missingText) {
    return `Log these certificates next: ${missingText}.`;
  }
  if (addedText) {
    return `Highlight these certificates near your summary: ${addedText}.`;
  }
  return "Keep credentials up to date across LinkedIn and your resume.";
}
function buildFormatAdvice() {
  return "Tighten formatting, headings, and spacing so ATS parsers never stumble.";
}
function buildActionableMessage$1(type, payload = {}) {
  switch (type) {
    case "skills":
      return buildSkillsAdvice(payload);
    case "experience":
      return buildExperienceAdvice(payload);
    case "designation":
      return buildDesignationAdvice(payload);
    case "summary":
      return buildSummaryAdvice(payload);
    case "certificates":
      return buildCertificateAdvice(payload);
    case "format":
      return buildFormatAdvice();
    default:
      return "Keep iterating here so hiring managers immediately spot your fit.";
  }
}
function buildCategoryAdvice$1(categoryKey, bucket = {}) {
  const type = inferActionType$1(categoryKey);
  const added = normaliseActionList$1(bucket.added || []);
  const missing = normaliseActionList$1(bucket.missing || []);
  const advice = buildActionableMessage$1(type, { added, missing });
  return advice;
}
function buildActionableAddenda$1(type, { added = [], removed = [] }) {
  const actions = [];
  const addedList = normaliseActionList$1(added);
  const removedList = normaliseActionList$1(removed);
  switch (type) {
    case "skills":
      addedList.forEach((item) => actions.push(`Practice ${item}`));
      removedList.forEach((item) => actions.push(`Phase out ${item}`));
      break;
    case "experience":
      addedList.forEach((item) => actions.push(`Rehearse story about ${item}`));
      removedList.forEach((item) => actions.push(`Archive ${item}`));
      break;
    case "designation":
      addedList.forEach((item) => actions.push(`Use title ${item}`));
      removedList.forEach((item) => actions.push(`Retire title ${item}`));
      break;
    case "summary":
      addedList.forEach((item) => actions.push(`Lead with ${item}`));
      removedList.forEach((item) => actions.push(`Trim ${item}`));
      break;
    case "certificates":
      addedList.forEach((item) => actions.push(`Add credential ${item}`));
      removedList.forEach((item) => actions.push(`Archive credential ${item}`));
      break;
    case "format":
      addedList.forEach((item) => actions.push(`Apply formatting update: ${item}`));
      removedList.forEach((item) => actions.push(`Retire formatting element: ${item}`));
      break;
    default:
      addedList.forEach((item) => actions.push(`Follow up on ${item}`));
      removedList.forEach((item) => actions.push(`Deprioritise ${item}`));
      break;
  }
  return actions;
}
function buildSegmentAdvice$1(label, segment = {}) {
  const type = inferActionType$1(label);
  const added = normaliseActionList$1(segment.added || []);
  const removed = normaliseActionList$1(segment.removed || segment.missing || []);
  const advice = buildActionableMessage$1(type, { added, missing: [], removed });
  const addenda = buildActionableAddenda$1(type, { added, removed });
  if (addenda.length === 0) {
    return advice;
  }
  const actionSummary = addenda.join("; ");
  return `${advice} Action items: ${actionSummary}.`;
}
function collectSegmentsByType(segments, targetType) {
  if (!Array.isArray(segments) || !segments.length) {
    return { added: [], removed: [] };
  }
  return segments.reduce(
    (acc, segment) => {
      if (!segment || typeof segment !== "object")
        return acc;
      const label = [segment.section, segment.label, segment.key].map((value) => normaliseString(value)).find(Boolean);
      const type = inferActionType$1(label);
      if (type !== targetType)
        return acc;
      acc.added.push(...normaliseActionList$1(segment.added || []));
      const removed = normaliseActionList$1(segment.removed || segment.missing || []);
      acc.removed.push(...removed);
      return acc;
    },
    { added: [], removed: [] }
  );
}
function buildImprovementHintFromSegment$1(segment) {
  if (!segment || typeof segment !== "object")
    return null;
  const label = [segment.section, segment.label, segment.key].map((value) => normaliseString(value)).find(Boolean);
  const advice = buildSegmentAdvice$1(label, segment);
  if (advice) {
    return label ? `${label}: ${advice}` : advice;
  }
  const reasons = normaliseActionList$1(segment.reason || segment.reasons || []);
  if (reasons.length) {
    return label ? `${label}: ${reasons[0]}` : reasons[0];
  }
  return null;
}
function buildMetricTip$1(metric = {}, context = {}) {
  const explicit = normaliseString(metric.tip);
  if (explicit)
    return explicit;
  if (Array.isArray(metric.tips)) {
    const firstTip = metric.tips.map(normaliseString).find(Boolean);
    if (firstTip) {
      return firstTip;
    }
  }
  const category = normaliseString(metric.category);
  const type = inferActionType$1(category);
  const match = context.match || {};
  const segments = Array.isArray(match.improvementSummary) ? match.improvementSummary : [];
  switch (type) {
    case "skills": {
      const added = normaliseActionList$1(match.addedSkills || []);
      const missing = normaliseActionList$1(match.missingSkills || []);
      return buildActionableMessage$1("skills", { added, missing });
    }
    case "designation": {
      const added = normaliseActionList$1([match.modifiedTitle]);
      const missing = normaliseActionList$1([match.originalTitle]);
      return buildActionableMessage$1("designation", { added, missing });
    }
    case "experience": {
      const payload = collectSegmentsByType(segments, "experience");
      return buildActionableMessage$1("experience", payload);
    }
    case "summary": {
      const payload = collectSegmentsByType(segments, "summary");
      return buildActionableMessage$1("summary", payload);
    }
    case "certificates": {
      const payload = collectSegmentsByType(segments, "certificates");
      if (payload.added.length || payload.removed.length) {
        return buildActionableMessage$1("certificates", payload);
      }
      return buildActionableMessage$1("certificates", {});
    }
    case "format":
      return buildActionableMessage$1("format");
    default:
      return buildActionableMessage$1("general");
  }
}
var actionableAdviceShared = {
  normaliseActionList: normaliseActionList$1,
  formatActionList: formatActionList$1,
  inferActionType: inferActionType$1,
  buildActionableMessage: buildActionableMessage$1,
  buildCategoryAdvice: buildCategoryAdvice$1,
  buildSegmentAdvice: buildSegmentAdvice$1,
  buildActionableAddenda: buildActionableAddenda$1,
  buildImprovementHintFromSegment: buildImprovementHintFromSegment$1,
  buildMetricTip: buildMetricTip$1
};
const actionableAdvice = /* @__PURE__ */ getDefaultExportFromCjs(actionableAdviceShared);
const {
  normaliseActionList,
  formatActionList,
  inferActionType,
  buildActionableMessage,
  buildCategoryAdvice,
  buildSegmentAdvice,
  buildActionableAddenda,
  buildImprovementHintFromSegment,
  buildMetricTip
} = actionableAdvice;
const badgeThemes = {
  EXCELLENT: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  GOOD: "bg-sky-50 text-sky-700 border border-sky-200",
  FAIR: "bg-amber-50 text-amber-700 border border-amber-200",
  "NEEDS IMPROVEMENT": "bg-rose-50 text-rose-700 border border-rose-200"
};
const labelTone = {
  EXCELLENT: "text-emerald-700",
  GOOD: "text-sky-700",
  FAIR: "text-amber-700",
  "NEEDS IMPROVEMENT": "text-rose-700"
};
function normalizeLabel(label) {
  if (!label)
    return "GOOD";
  const upper = label.toUpperCase();
  if (badgeThemes[upper])
    return upper;
  return upper;
}
function formatScore(score) {
  if (typeof score !== "number") {
    return { display: score ?? "N/A", suffix: "" };
  }
  const rounded = Number.isFinite(score) ? Math.round(score) : score;
  return { display: rounded, suffix: "%" };
}
function formatScoreDelta$1(before, after) {
  if (typeof before !== "number" || typeof after !== "number") {
    return null;
  }
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return null;
  }
  const delta = after - before;
  if (delta === 0) {
    return null;
  }
  const rounded = Math.round(delta);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded} pts`;
}
const metricDescriptions = {
  "Keyword Match": "Measures how closely your resume keyword usage mirrors the job description so ATS scanners can confidently match you.",
  "Skills Coverage": "Summarises how well you showcase the core technical and soft skills the job emphasises.",
  "Format Compliance": "Checks whether your layout, headings, and file structure follow ATS-friendly formatting conventions.",
  Readability: "Looks at sentence length, clarity, and scannability to ensure recruiters can digest your story quickly.",
  "Experience Alignment": "Evaluates how your accomplishments map to the role’s responsibilities and impact areas.",
  Structure: "Reviews the ordering of sections, headings, and spacing that help ATS parsers read the resume correctly.",
  Achievements: "Highlights the presence of quantified, outcome-focused statements that prove your impact.",
  "Core Competencies": "Captures whether the resume surfaces the core competencies and proficiencies the JD prioritises."
};
function describeMetric(metric) {
  const explicit = typeof (metric == null ? void 0 : metric.description) === "string" ? metric.description.trim() : "";
  if (explicit)
    return explicit;
  const category = typeof (metric == null ? void 0 : metric.category) === "string" ? metric.category.trim() : "";
  if (category) {
    const mapped = metricDescriptions[category];
    if (mapped)
      return mapped;
    return `Represents how well your resume performs for ${category.toLowerCase()} when parsed by applicant tracking systems.`;
  }
  return "Shows how this aspect of your resume aligns with ATS expectations.";
}
function ATSScoreCard({ metric, improvement }) {
  const afterScore = typeof (metric == null ? void 0 : metric.afterScore) === "number" && Number.isFinite(metric.afterScore) ? metric.afterScore : typeof (metric == null ? void 0 : metric.score) === "number" ? metric.score : null;
  const beforeScore = typeof (metric == null ? void 0 : metric.beforeScore) === "number" && Number.isFinite(metric.beforeScore) ? metric.beforeScore : afterScore;
  const { display: afterDisplay, suffix: afterSuffix } = formatScore(afterScore);
  const { display: beforeDisplay, suffix: beforeSuffix } = formatScore(beforeScore);
  const rawAfterRating = (metric == null ? void 0 : metric.afterRatingLabel) || (metric == null ? void 0 : metric.ratingLabel);
  const ratingLabel = normalizeLabel(rawAfterRating);
  const badgeClass = badgeThemes[ratingLabel] || badgeThemes.GOOD;
  const labelClass = labelTone[ratingLabel] || labelTone.GOOD;
  const beforeRatingLabel = (metric == null ? void 0 : metric.beforeRatingLabel) ? normalizeLabel(metric.beforeRatingLabel) : null;
  const deltaText = (metric == null ? void 0 : metric.deltaText) || formatScoreDelta$1(beforeScore, afterScore);
  const deltaTrend = typeof beforeScore === "number" && typeof afterScore === "number" && Number.isFinite(beforeScore) && Number.isFinite(afterScore) ? afterScore - beforeScore : null;
  const deltaBadgeTone = (() => {
    if (!deltaText) {
      return "bg-slate-200 text-slate-700";
    }
    if (deltaTrend === null) {
      return "bg-slate-200 text-slate-700";
    }
    if (deltaTrend > 0) {
      return "bg-emerald-100 text-emerald-700";
    }
    if (deltaTrend < 0) {
      return "bg-rose-100 text-rose-700";
    }
    return "bg-slate-200 text-slate-700";
  })();
  const beforeAccentTone = typeof beforeScore === "number" ? "border border-indigo-200 bg-indigo-50" : "border border-slate-200 bg-slate-50";
  const beforeLabelTone = typeof beforeScore === "number" ? "text-indigo-600" : "text-slate-500";
  const beforeValueTone = typeof beforeScore === "number" ? "text-indigo-700" : "text-slate-500";
  const afterAccentTone = typeof afterScore === "number" ? "border border-emerald-200 bg-emerald-50" : "border border-slate-200 bg-slate-50";
  const afterLabelTone = typeof afterScore === "number" ? "text-emerald-600" : "text-slate-500";
  const afterValueTone = typeof afterScore === "number" ? "text-emerald-700" : "text-slate-500";
  const beforeRatingBadgeTone = typeof beforeScore === "number" ? "border border-indigo-200 bg-white text-indigo-600" : "border border-slate-200 bg-white text-slate-500";
  const explicitTip = typeof (metric == null ? void 0 : metric.tip) === "string" ? metric.tip.trim() : "";
  const listTips = Array.isArray(metric == null ? void 0 : metric.tips) ? metric.tips.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean) : [];
  const fallbackTip = buildMetricTip(metric);
  const tip = explicitTip || listTips[0] || fallbackTip || "";
  const category = (metric == null ? void 0 : metric.category) ?? "Metric";
  const metricDescription = describeMetric(metric);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "article",
    {
      className: "flex h-full flex-col gap-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md",
      "data-testid": "ats-score-card",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-slate-500", children: "Metric" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-slate-900", children: category }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                InfoTooltip,
                {
                  variant: "light",
                  align: "left",
                  label: `What does the ${category} score mean?`,
                  content: metricDescription
                }
              )
            ] })
          ] }),
          ratingLabel && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`,
              "data-testid": "rating-badge",
              children: ratingLabel
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-indigo-600", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-indigo-500", "aria-hidden": "true" }),
            "Before"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-emerald-600", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-emerald-500", "aria-hidden": "true" }),
            "After"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded-lg p-3 ${beforeAccentTone}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-xs font-semibold uppercase tracking-wide ${beforeLabelTone}`, children: "ATS Score Before" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-baseline gap-2", "data-testid": "metric-score-before", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-3xl font-semibold md:text-4xl ${beforeValueTone}`, children: beforeDisplay }),
              beforeSuffix && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm font-medium ${beforeLabelTone}`, children: beforeSuffix })
            ] }),
            beforeRatingLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${beforeRatingBadgeTone}`, children: beforeRatingLabel })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `relative rounded-lg p-3 ${afterAccentTone}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-xs font-semibold uppercase tracking-wide ${afterLabelTone}`, children: "ATS Score After" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-baseline gap-2", "data-testid": "metric-score", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-4xl font-semibold md:text-5xl ${afterValueTone}`, children: afterDisplay }),
              afterSuffix && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm font-medium ${afterLabelTone}`, children: afterSuffix })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-3 inline-flex w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium ${labelClass}`, children: ratingLabel }),
            deltaText && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-semibold ${deltaBadgeTone}`,
                "data-testid": "metric-delta",
                children: deltaText
              }
            )
          ] })
        ] }),
        (tip || improvement) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-auto space-y-3", children: [
          tip && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "footer",
            {
              className: "rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700",
              "data-testid": "metric-tip",
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-500", children: "Tip" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "flex-1", children: tip })
              ] })
            }
          ),
          improvement && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: improvement.onClick,
                disabled: improvement.disabled,
                className: `w-full rounded-md px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${improvement.disabled ? "cursor-not-allowed bg-slate-300 text-slate-500" : "bg-emerald-600 hover:bg-emerald-500"}`,
                "aria-busy": improvement.busy ? "true" : "false",
                children: improvement.busy ? "Improving…" : improvement.label
              }
            ),
            improvement.helper && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs leading-relaxed text-slate-500", children: improvement.helper }),
            improvement.lockMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-slate-500", children: improvement.lockMessage })
          ] }) })
        ] })
      ]
    }
  );
}
const ATS_CATEGORY_ORDER = [
  "Layout & Searchability",
  "Readability",
  "Impact",
  "Crispness",
  "Other"
];
function buildMissingAtsMetric(category) {
  const placeholderTip = `ATS analysis has not produced a ${category.toLowerCase()} score yet. Run "Evaluate me against the JD" to populate this metric.`;
  return {
    category,
    score: null,
    rating: "PENDING",
    ratingLabel: "PENDING",
    tip: placeholderTip,
    tips: [placeholderTip]
  };
}
function ensureAtsCategoryCoverage(metrics) {
  const list = Array.isArray(metrics) ? metrics.filter(Boolean) : [];
  const categoryMap = /* @__PURE__ */ new Map();
  list.forEach((metric) => {
    const category = typeof (metric == null ? void 0 : metric.category) === "string" ? metric.category.trim() : "";
    if (!category)
      return;
    if (!categoryMap.has(category)) {
      categoryMap.set(category, metric);
    }
  });
  const extras = list.filter((metric) => {
    const category = typeof (metric == null ? void 0 : metric.category) === "string" ? metric.category.trim() : "";
    return category && !ATS_CATEGORY_ORDER.includes(category);
  });
  const trackedCategories = ATS_CATEGORY_ORDER.filter((category) => categoryMap.has(category));
  const uniqueMetricCount = categoryMap.size;
  if (uniqueMetricCount >= ATS_CATEGORY_ORDER.length) {
    return list;
  }
  if (!trackedCategories.length) {
    if (extras.length) {
      return extras;
    }
    return ATS_CATEGORY_ORDER.map((category) => buildMissingAtsMetric(category));
  }
  const ensured = ATS_CATEGORY_ORDER.map((category) => categoryMap.get(category) || buildMissingAtsMetric(category));
  return extras.length ? [...ensured, ...extras] : ensured;
}
function clampScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return null;
  }
  return Math.min(Math.max(Math.round(score), 0), 100);
}
function normalizeSkills(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills.map((skill) => {
    if (typeof skill === "string")
      return skill.trim();
    if (skill === null || skill === void 0)
      return "";
    return String(skill).trim();
  }).filter(Boolean);
}
function summariseSkills(skills, limit = 5) {
  const list = normalizeSkills(skills);
  if (list.length <= limit) {
    return list.join(", ");
  }
  const visible = list.slice(0, limit);
  const remaining = list.length - visible.length;
  return `${visible.join(", ")}, +${remaining} more`;
}
function normalizeText$1(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "";
  }
  if (value === null || value === void 0) {
    return "";
  }
  return String(value || "").trim();
}
function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText$1(entry)).filter(Boolean);
  }
  const text = normalizeText$1(value);
  return text ? [text] : [];
}
function normalizeImprovementSegment(segment = {}) {
  if (!segment || typeof segment !== "object")
    return null;
  const section = normalizeText$1(segment.section || segment.label || segment.key);
  const added = normalizeList(segment.added);
  const removed = normalizeList(segment.removed);
  const reasons = normalizeList(segment.reason);
  if (!section && !added.length && !removed.length && !reasons.length) {
    return null;
  }
  return { section, added, removed, reasons };
}
function formatReadableList$1(items) {
  const list = Array.isArray(items) ? items.map((item) => normalizeText$1(item)).filter(Boolean) : [];
  if (!list.length)
    return "";
  if (list.length === 1)
    return list[0];
  if (list.length === 2)
    return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}
function stripEndingPunctuation(value) {
  if (typeof value !== "string")
    return "";
  return value.replace(/[.!?]+$/u, "");
}
function formatDelta(originalScore, enhancedScore) {
  if (typeof originalScore !== "number" || typeof enhancedScore !== "number") {
    return null;
  }
  const delta = enhancedScore - originalScore;
  if (!Number.isFinite(delta) || delta === 0)
    return null;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(0)} pts`;
}
const selectionFactorToneStyles = {
  positive: { bullet: "bg-emerald-500", label: "text-emerald-700" },
  negative: { bullet: "bg-amber-500", label: "text-amber-700" },
  info: { bullet: "bg-sky-500", label: "text-sky-700" },
  neutral: { bullet: "bg-slate-400", label: "text-slate-700" },
  default: { bullet: "bg-slate-400", label: "text-slate-700" }
};
function ATSScoreDashboard({
  metrics = [],
  baselineMetrics = [],
  match,
  metricActionMap,
  onImproveMetric,
  improvementState = {}
}) {
  const metricCandidates = Array.isArray(metrics) ? metrics.filter(Boolean) : Object.values(metrics || {}).filter(Boolean);
  const metricList = ensureAtsCategoryCoverage(metricCandidates);
  const baselineList = Array.isArray(baselineMetrics) ? baselineMetrics : Object.values(baselineMetrics || {});
  const baselineMap = new Map(
    baselineList.filter((metric) => metric == null ? void 0 : metric.category).map((metric) => [metric.category, metric])
  );
  if (!metricList.length) {
    return null;
  }
  const displayMetrics = metricList.map((metric) => {
    const baselineMetric = (metric == null ? void 0 : metric.category) ? baselineMap.get(metric.category) || {} : {};
    const beforeScore = clampScore(
      typeof (metric == null ? void 0 : metric.beforeScore) === "number" ? metric.beforeScore : typeof (baselineMetric == null ? void 0 : baselineMetric.score) === "number" ? baselineMetric.score : typeof (metric == null ? void 0 : metric.score) === "number" ? metric.score : null
    );
    const afterScore = clampScore(
      typeof (metric == null ? void 0 : metric.afterScore) === "number" ? metric.afterScore : typeof (metric == null ? void 0 : metric.score) === "number" ? metric.score : null
    );
    const enrichedMetric = {
      ...metric,
      beforeScore,
      afterScore,
      beforeRatingLabel: (metric == null ? void 0 : metric.beforeRatingLabel) || (baselineMetric == null ? void 0 : baselineMetric.ratingLabel) || (baselineMetric == null ? void 0 : baselineMetric.rating) || (metric == null ? void 0 : metric.ratingLabel) || null,
      afterRatingLabel: (metric == null ? void 0 : metric.afterRatingLabel) || (metric == null ? void 0 : metric.ratingLabel),
      deltaText: formatDelta(beforeScore, afterScore)
    };
    const metricWithTip = { ...enrichedMetric, tip: buildMetricTip(enrichedMetric, { match }) };
    if (!metricActionMap || typeof onImproveMetric !== "function") {
      return { metric: metricWithTip, improvement: null };
    }
    const category = typeof (metric == null ? void 0 : metric.category) === "string" ? metric.category.trim() : "";
    const config = category ? metricActionMap.get(category) || null : null;
    if (!config || !config.actionKey) {
      return { metric: metricWithTip, improvement: null };
    }
    const activeBatchKeys = Array.isArray(improvementState.activeBatchKeys) ? improvementState.activeBatchKeys : [];
    const busy = improvementState.activeKey === config.actionKey || improvementState.activeKey === "batch" && activeBatchKeys.includes(config.actionKey);
    const locked = Boolean(improvementState.locked);
    const disabledKeys = Array.isArray(improvementState.disabledKeys) ? improvementState.disabledKeys : [];
    const disabled = locked || busy || disabledKeys.includes(config.actionKey);
    const lockMessage = locked ? improvementState.lockMessage || "" : "";
    return {
      metric: metricWithTip,
      improvement: {
        key: config.actionKey,
        label: config.label,
        helper: config.helper,
        onClick: () => onImproveMetric(config.actionKey),
        disabled,
        busy,
        lockMessage
      }
    };
  });
  const originalScoreValue = clampScore(
    typeof (match == null ? void 0 : match.atsScoreBefore) === "number" ? match.atsScoreBefore : typeof (match == null ? void 0 : match.originalScore) === "number" ? match.originalScore : null
  );
  const enhancedScoreValue = clampScore(
    typeof (match == null ? void 0 : match.atsScoreAfter) === "number" ? match.atsScoreAfter : null
  );
  const matchDelta = typeof originalScoreValue === "number" && typeof enhancedScoreValue === "number" ? formatDelta(originalScoreValue, enhancedScoreValue) : null;
  const atsScoreSummary = (() => {
    if (originalScoreValue !== null && enhancedScoreValue !== null) {
      return `ATS score moved from ${originalScoreValue}% to ${enhancedScoreValue}%${matchDelta ? ` (${matchDelta})` : ""}.`;
    }
    if (originalScoreValue !== null) {
      return `Current ATS score before enhancements: ${originalScoreValue}%.`;
    }
    if (enhancedScoreValue !== null) {
      return `Current ATS score after enhancements: ${enhancedScoreValue}%.`;
    }
    return null;
  })();
  const selectionProbabilityBeforeValue = typeof (match == null ? void 0 : match.selectionProbabilityBefore) === "number" ? match.selectionProbabilityBefore : null;
  const selectionProbabilityBeforeMeaning = (match == null ? void 0 : match.selectionProbabilityBeforeMeaning) || (typeof selectionProbabilityBeforeValue === "number" ? selectionProbabilityBeforeValue >= 75 ? "High" : selectionProbabilityBeforeValue >= 55 ? "Medium" : "Low" : null);
  const selectionProbabilityBeforeRationale = (match == null ? void 0 : match.selectionProbabilityBeforeRationale) || (selectionProbabilityBeforeMeaning && typeof selectionProbabilityBeforeValue === "number" ? `Projected ${selectionProbabilityBeforeMeaning.toLowerCase()} probability (${selectionProbabilityBeforeValue}%) that this resume will be shortlisted for the JD.` : null);
  const selectionProbabilityAfterValue = typeof (match == null ? void 0 : match.selectionProbabilityAfter) === "number" ? match.selectionProbabilityAfter : typeof (match == null ? void 0 : match.selectionProbability) === "number" ? match.selectionProbability : null;
  const selectionProbabilityAfterMeaning = (match == null ? void 0 : match.selectionProbabilityAfterMeaning) || (match == null ? void 0 : match.selectionProbabilityMeaning) || (typeof selectionProbabilityAfterValue === "number" ? selectionProbabilityAfterValue >= 75 ? "High" : selectionProbabilityAfterValue >= 55 ? "Medium" : "Low" : null);
  const selectionProbabilityAfterRationale = (match == null ? void 0 : match.selectionProbabilityAfterRationale) || (match == null ? void 0 : match.selectionProbabilityRationale) || (selectionProbabilityAfterMeaning && typeof selectionProbabilityAfterValue === "number" ? `Projected ${selectionProbabilityAfterMeaning.toLowerCase()} probability (${selectionProbabilityAfterValue}%) that this resume will be shortlisted for the JD.` : null);
  const selectionProbabilityDelta = typeof selectionProbabilityBeforeValue === "number" && typeof selectionProbabilityAfterValue === "number" ? formatDelta(selectionProbabilityBeforeValue, selectionProbabilityAfterValue) : null;
  const selectionProbabilityFactors = Array.isArray(match == null ? void 0 : match.selectionProbabilityFactors) ? match.selectionProbabilityFactors.map((factor, index2) => {
    if (!factor)
      return null;
    if (typeof factor === "string") {
      return {
        key: `selection-factor-${index2}`,
        label: normalizeText$1(factor),
        detail: null,
        impact: "neutral"
      };
    }
    if (typeof factor === "object") {
      const label = normalizeText$1(factor.label || factor.title);
      if (!label)
        return null;
      const detail = normalizeText$1(factor.detail || factor.message || factor.description);
      const impact = factor.impact === "positive" || factor.impact === "negative" || factor.impact === "info" ? factor.impact : "neutral";
      return {
        key: normalizeText$1(factor.key) || `selection-factor-${index2}`,
        label,
        detail: detail || null,
        impact
      };
    }
    return null;
  }).filter((factor) => factor && factor.label) : [];
  const selectionProbabilitySummary = (() => {
    if (typeof selectionProbabilityBeforeValue === "number" && typeof selectionProbabilityAfterValue === "number") {
      return `Selection chance moved from ${selectionProbabilityBeforeValue}% to ${selectionProbabilityAfterValue}%${selectionProbabilityDelta ? ` (${selectionProbabilityDelta})` : ""}.`;
    }
    if (typeof selectionProbabilityBeforeValue === "number") {
      return `Selection chance before enhancements: ${selectionProbabilityBeforeValue}%.`;
    }
    if (typeof selectionProbabilityAfterValue === "number") {
      return `Selection chance after enhancements: ${selectionProbabilityAfterValue}%.`;
    }
    return "Selection chance will appear once we evaluate your resume against the job description.";
  })();
  const hasComparableScores = typeof originalScoreValue === "number" && typeof enhancedScoreValue === "number";
  const scoreBands = hasComparableScores ? [
    {
      label: "ATS Score Before",
      value: originalScoreValue,
      tone: "bg-indigo-500",
      textTone: "text-indigo-700"
    },
    {
      label: "ATS Score After",
      value: enhancedScoreValue,
      tone: "bg-emerald-500",
      textTone: "text-emerald-700"
    }
  ] : [];
  const originalScoreDescription = (match == null ? void 0 : match.atsScoreBeforeExplanation) || (match == null ? void 0 : match.originalScoreExplanation) || "Weighted ATS composite for your uploaded resume across layout, readability, impact, crispness, and other JD-aligned metrics.";
  const enhancedScoreDescription = (match == null ? void 0 : match.atsScoreAfterExplanation) || (match == null ? void 0 : match.enhancedScoreExplanation) || "Updated weighted ATS composite after applying ResumeForge improvements tied to the job description.";
  const scoreComparisonDescription = "Shows the weighted ATS composite before and after improvements so you can see how structural and keyword fixes closed gaps.";
  const selectionProbabilityDescription = "Estimates shortlist odds before and after using designation match, years/experience alignment, skill match, task overlap, highlights, and certifications.";
  const snapshotSegments = (() => {
    const segments = [];
    const formatPercent = (value) => typeof value === "number" ? `${value}%` : "—";
    if (originalScoreValue !== null || enhancedScoreValue !== null) {
      const hasBeforeScore = typeof originalScoreValue === "number";
      const hasAfterScore = typeof enhancedScoreValue === "number";
      segments.push({
        id: "ats",
        label: "ATS Score",
        beforeValue: originalScoreValue,
        afterValue: enhancedScoreValue,
        beforeLabel: "Before",
        afterLabel: "After",
        delta: typeof originalScoreValue === "number" && typeof enhancedScoreValue === "number" ? matchDelta : null,
        beforeTone: "text-indigo-700",
        afterTone: "text-emerald-700",
        beforeBadgeClass: "border border-indigo-200 bg-indigo-50 text-indigo-700",
        afterBadgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
        beforeLabelClass: hasBeforeScore ? "text-indigo-600" : "text-slate-500",
        afterLabelClass: hasAfterScore ? "text-emerald-600" : "text-slate-500",
        beforeAccentClass: hasBeforeScore ? "border border-indigo-200 bg-indigo-50" : "border border-slate-200 bg-slate-50",
        afterAccentClass: hasAfterScore ? "border border-emerald-200 bg-emerald-50" : "border border-slate-200 bg-slate-50",
        format: formatPercent
      });
    }
    const hasBeforeSelection = typeof selectionProbabilityBeforeValue === "number";
    const hasAfterSelection = typeof selectionProbabilityAfterValue === "number";
    segments.push({
      id: "selection",
      label: "Selection Chance",
      beforeValue: selectionProbabilityBeforeValue,
      afterValue: selectionProbabilityAfterValue,
      beforeLabel: "Before",
      afterLabel: "After",
      delta: typeof selectionProbabilityBeforeValue === "number" && typeof selectionProbabilityAfterValue === "number" ? selectionProbabilityDelta : null,
      beforeMeaning: selectionProbabilityBeforeMeaning ? `${selectionProbabilityBeforeMeaning} Outlook` : null,
      afterMeaning: selectionProbabilityAfterMeaning ? `${selectionProbabilityAfterMeaning} Outlook` : null,
      beforeTone: "text-indigo-700",
      afterTone: "text-emerald-700",
      beforeBadgeClass: "border border-indigo-200 bg-indigo-50 text-indigo-700",
      afterBadgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
      beforeLabelClass: hasBeforeSelection ? "text-indigo-600" : "text-slate-500",
      afterLabelClass: hasAfterSelection ? "text-emerald-600" : "text-slate-500",
      beforeAccentClass: hasBeforeSelection ? "border border-indigo-200 bg-indigo-50" : "border border-slate-200 bg-slate-50",
      afterAccentClass: hasAfterSelection ? "border border-emerald-200 bg-emerald-50" : "border border-slate-200 bg-slate-50",
      format: formatPercent
    });
    return segments;
  })();
  const missingSkills = normalizeSkills(match == null ? void 0 : match.missingSkills);
  const addedSkills = normalizeSkills(match == null ? void 0 : match.addedSkills);
  const selectionBeforeAvailable = typeof selectionProbabilityBeforeValue === "number";
  const selectionAfterAvailable = typeof selectionProbabilityAfterValue === "number";
  const selectionBeforeAccent = selectionBeforeAvailable ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-slate-50";
  const selectionBeforeLabelTone = selectionBeforeAvailable ? "text-indigo-600" : "text-slate-500";
  const selectionBeforeValueTone = selectionBeforeAvailable ? "text-indigo-700" : "text-slate-500";
  const selectionAfterAccent = selectionAfterAvailable ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50";
  const selectionAfterLabelTone = selectionAfterAvailable ? "text-emerald-600" : "text-slate-500";
  const selectionAfterValueTone = selectionAfterAvailable ? "text-emerald-700" : "text-slate-500";
  const selectionDeltaTone = (() => {
    if (!selectionProbabilityDelta) {
      return "bg-slate-200 text-slate-700";
    }
    if (!selectionBeforeAvailable || !selectionAfterAvailable) {
      return "bg-slate-200 text-slate-700";
    }
    const deltaRaw = selectionProbabilityAfterValue - selectionProbabilityBeforeValue;
    if (!Number.isFinite(deltaRaw)) {
      return "bg-slate-200 text-slate-700";
    }
    if (deltaRaw > 0) {
      return "bg-emerald-100 text-emerald-700";
    }
    if (deltaRaw < 0) {
      return "bg-rose-100 text-rose-700";
    }
    return "bg-slate-200 text-slate-700";
  })();
  const matchStatusStyles = {
    match: {
      label: "Match",
      badgeClass: "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
    },
    mismatch: {
      label: "Mismatch",
      badgeClass: "inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700"
    }
  };
  const originalStatus = missingSkills.length > 0 ? "mismatch" : "match";
  const enhancedStatus = missingSkills.length > 0 ? "mismatch" : "match";
  const originalAdvice = originalStatus === "mismatch" ? `You are missing these skills: ${summariseSkills(missingSkills)}` : addedSkills.length > 0 ? `ResumeForge added: ${summariseSkills(addedSkills)}` : "All priority JD skills are covered.";
  const enhancedAdvice = enhancedStatus === "mismatch" ? `Still missing these skills: ${summariseSkills(missingSkills)}` : addedSkills.length > 0 ? `Now highlighting: ${summariseSkills(addedSkills)}` : "Enhanced draft fully aligns with the JD keywords.";
  const improvementSegments = Array.isArray(match == null ? void 0 : match.improvementSummary) ? match.improvementSummary : [];
  const normalizedImprovementSegments = improvementSegments.map((segment) => normalizeImprovementSegment(segment)).filter(Boolean);
  const improvementDetails = normalizedImprovementSegments.map((segment, index2) => {
    const changeParts = [];
    if (segment.added.length) {
      const additions = formatReadableList$1(segment.added);
      if (additions) {
        changeParts.push(`Added ${additions}.`);
      }
    }
    if (segment.removed.length) {
      const removals = formatReadableList$1(segment.removed);
      if (removals) {
        changeParts.push(`Removed ${removals}.`);
      }
    }
    const changeSummary = changeParts.length ? changeParts.join(" ") : "Refined this area to tighten alignment with the job description.";
    const reasonText = segment.reasons.length ? segment.reasons.join(" ") : "Keeps your positioning focused on what this employer values most.";
    const focusSource = segment.reasons[0] || segment.added[0] || segment.section || `update ${index2 + 1}`;
    const interviewFocus = stripEndingPunctuation(focusSource);
    const interviewAdvice = interviewFocus ? `Interview prep: Prepare a concise example that demonstrates ${interviewFocus}.` : `Interview prep: Prepare a concise example that demonstrates your impact in ${segment.section || "this area"}.`;
    return {
      id: `${segment.section || "segment"}-${index2}`,
      section: segment.section || `Update ${index2 + 1}`,
      changeSummary,
      reasonText,
      interviewAdvice
    };
  });
  const improvementNarrative = improvementDetails.length ? improvementDetails.map((detail) => `${detail.section}: ${detail.reasonText}`).join(" ") : (match == null ? void 0 : match.selectionProbabilityRationale) || (hasComparableScores ? `Score moved from ${originalScoreValue}% to ${enhancedScoreValue}%, lifting selection odds by covering more of the JD's required keywords and achievements.` : "Enhanced resume aligns more closely with the job description, increasing selection odds.");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-6", "aria-label": "ATS dashboard", "aria-live": "polite", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-semibold text-slate-900", children: "ATS Performance Dashboard" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-600", children: "Track how your resume aligns with the job description across keyword, structure, readability, and skill coverage metrics." })
      ] }),
      match && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700",
          "data-testid": "dashboard-live-indicator",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex h-2 w-2 rounded-full bg-emerald-500", "aria-hidden": "true" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Live analysis" })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", children: displayMetrics.map(({ metric, improvement }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      ATSScoreCard,
      {
        metric,
        improvement
      },
      metric.category
    )) }),
    match && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: `grid grid-cols-1 gap-4 ${hasComparableScores ? "md:grid-cols-4" : "md:grid-cols-3"}`,
          "aria-label": "match comparison",
          children: [
            (atsScoreSummary || selectionProbabilitySummary) && /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: "md:col-span-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
                "data-testid": "score-summary-banner",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Score Snapshot" }),
                  atsScoreSummary && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-700", "data-testid": "ats-score-summary", children: atsScoreSummary }),
                  selectionProbabilitySummary && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-700", "data-testid": "selection-summary", children: selectionProbabilitySummary }),
                  snapshotSegments.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "div",
                    {
                      className: `mt-4 grid gap-3 ${snapshotSegments.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1"}`,
                      "data-testid": "score-summary-metrics",
                      children: snapshotSegments.map((segment) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "div",
                        {
                          className: "rounded-lg border border-slate-200 bg-slate-50 p-4",
                          "data-testid": `${segment.id}-summary-card`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase text-slate-500", children: segment.label }),
                              segment.delta && /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "span",
                                {
                                  className: "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700",
                                  "data-testid": `${segment.id}-summary-delta`,
                                  children: segment.delta
                                }
                              )
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-indigo-600", children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-indigo-500", "aria-hidden": "true" }),
                                "Before"
                              ] }),
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-emerald-600", children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-emerald-500", "aria-hidden": "true" }),
                                "After"
                              ] })
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-3 grid grid-cols-2 gap-4", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: `text-xs font-semibold uppercase tracking-wide ${segment.beforeLabelClass}`, children: segment.beforeLabel }),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-2", "data-testid": `${segment.id}-summary-before`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `rounded-md px-3 py-2 ${segment.beforeAccentClass}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-2xl font-semibold ${segment.beforeTone}`, children: segment.format(segment.beforeValue) }) }) }),
                                segment.beforeMeaning && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${segment.beforeBadgeClass}`, children: segment.beforeMeaning })
                              ] }),
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: `text-xs font-semibold uppercase tracking-wide ${segment.afterLabelClass}`, children: segment.afterLabel }),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-2", "data-testid": `${segment.id}-summary-after`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `rounded-md px-3 py-2 ${segment.afterAccentClass}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-2xl font-semibold ${segment.afterTone}`, children: segment.format(segment.afterValue) }) }) }),
                                segment.afterMeaning && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${segment.afterBadgeClass}`, children: segment.afterMeaning })
                              ] })
                            ] })
                          ]
                        },
                        segment.id
                      ))
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-indigo-600", children: "ATS Score Before" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  InfoTooltip,
                  {
                    variant: "light",
                    align: "right",
                    label: "How is the ATS score before calculated?",
                    content: originalScoreDescription
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-4xl font-semibold text-indigo-900", "data-testid": "original-score", children: typeof originalScoreValue === "number" ? `${originalScoreValue}%` : "—" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-indigo-700", "data-testid": "original-title", children: match.originalTitle || "Initial resume title unavailable." }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 space-y-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: matchStatusStyles[originalStatus].badgeClass,
                    "data-testid": "original-match-status",
                    children: matchStatusStyles[originalStatus].label
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-indigo-800", "data-testid": "original-match-advice", children: originalAdvice })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-emerald-600", children: "ATS Score After" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-4xl font-semibold text-emerald-900", "data-testid": "enhanced-score", children: typeof enhancedScoreValue === "number" ? `${enhancedScoreValue}%` : "—" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    InfoTooltip,
                    {
                      variant: "light",
                      align: "left",
                      label: "How is the ATS score after calculated?",
                      content: enhancedScoreDescription
                    }
                  )
                ] }),
                matchDelta && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "self-start rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700", "data-testid": "match-delta", children: matchDelta })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-emerald-700", "data-testid": "enhanced-title", children: match.modifiedTitle || match.originalTitle || "Enhanced resume title coming soon." }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 space-y-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: matchStatusStyles[enhancedStatus].badgeClass,
                    "data-testid": "enhanced-match-status",
                    children: matchStatusStyles[enhancedStatus].label
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-emerald-800", "data-testid": "enhanced-match-advice", children: enhancedAdvice })
              ] })
            ] }),
            hasComparableScores && /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
                "data-testid": "score-comparison-chart",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Score Comparison" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-600", children: "Visualise how the enhanced version closes the gap against ATS expectations." })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        InfoTooltip,
                        {
                          variant: "light",
                          align: "right",
                          label: "What does the score comparison show?",
                          content: scoreComparisonDescription
                        }
                      ),
                      matchDelta && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700", children: matchDelta })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "div",
                    {
                      className: "mt-4 space-y-4",
                      role: "img",
                      "aria-label": `ATS score before ${originalScoreValue}%, ATS score after ${enhancedScoreValue}%`,
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-indigo-600", children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-indigo-500", "aria-hidden": "true" }),
                            "Before"
                          ] }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-emerald-600", children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-emerald-500", "aria-hidden": "true" }),
                            "After"
                          ] })
                        ] }),
                        scoreBands.map(({ label, value, tone, textTone }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500", children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label }),
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: textTone, children: [
                              value,
                              "%"
                            ] })
                          ] }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-2 w-full rounded-full bg-slate-200", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "div",
                            {
                              className: `h-full rounded-full ${tone}`,
                              style: { width: `${value}%` },
                              "aria-hidden": "true"
                            }
                          ) })
                        ] }, label))
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-sm text-slate-700", "data-testid": "score-improvement-narrative", children: improvementNarrative })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Selection Probability" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  InfoTooltip,
                  {
                    variant: "light",
                    align: "right",
                    label: "How is the selection probability estimated?",
                    content: selectionProbabilityDescription
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 space-y-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded-lg border p-4 ${selectionBeforeAccent}`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-xs font-semibold uppercase tracking-wide ${selectionBeforeLabelTone}`, children: "Selection % Before" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-baseline gap-3", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-3xl font-semibold ${selectionBeforeValueTone}`, children: selectionBeforeAvailable ? `${selectionProbabilityBeforeValue}%` : "—" }),
                        selectionBeforeAvailable && selectionProbabilityBeforeMeaning && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-600", children: [
                          selectionProbabilityBeforeMeaning,
                          " Outlook"
                        ] })
                      ] })
                    ] }),
                    selectionProbabilityDelta && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-3 py-1 text-xs font-semibold ${selectionDeltaTone}`, children: selectionProbabilityDelta })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-600", children: selectionBeforeAvailable ? selectionProbabilityBeforeRationale || "Baseline estimate derived from your uploaded resume before enhancements." : "Baseline estimate will appear once we parse your original resume." })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded-lg border p-4 ${selectionAfterAccent}`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-xs font-semibold uppercase tracking-wide ${selectionAfterLabelTone}`, children: "Selection % After" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-baseline gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-3xl font-semibold ${selectionAfterValueTone}`, children: selectionAfterAvailable ? `${selectionProbabilityAfterValue}%` : "—" }),
                    selectionAfterAvailable && selectionProbabilityAfterMeaning && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-600", children: [
                      selectionProbabilityAfterMeaning,
                      " Outlook"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-600", children: selectionAfterAvailable ? selectionProbabilityAfterRationale || "Enhanced estimate reflecting ATS, keyword, and credential gains from the accepted changes." : "Enhanced estimate will populate after you apply at least one improvement." })
                ] }),
                selectionProbabilityFactors.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "div",
                  {
                    className: "rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4",
                    "data-testid": "selection-factors",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Key Factors" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 space-y-3", "data-testid": "selection-factors-list", children: selectionProbabilityFactors.map((factor) => {
                        const tone = selectionFactorToneStyles[factor.impact] || selectionFactorToneStyles.default;
                        return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-3", "data-testid": "selection-factor-item", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "span",
                            {
                              className: `mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${tone.bullet}`,
                              "aria-hidden": "true"
                            }
                          ),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-sm font-medium ${tone.label}`, children: factor.label }),
                            factor.detail && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-600", children: factor.detail })
                          ] })
                        ] }, factor.key);
                      }) })
                    ]
                  }
                )
              ] })
            ] })
          ]
        }
      ),
      improvementDetails.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
          "data-testid": "improvement-recap-card",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Improvement Recap" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-1 text-lg font-semibold text-slate-900", children: "What changed and why it matters" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                InfoTooltip,
                {
                  variant: "light",
                  align: "right",
                  label: "How should you use these improvements?",
                  content: "Each update highlights what changed, why it lifts your ATS alignment, and how to talk about it when you interview."
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-4 space-y-4", children: improvementDetails.map((detail) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "li",
              {
                className: "rounded-lg border border-slate-200 bg-slate-50 p-4",
                "data-testid": "improvement-recap-item",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: detail.section }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-700", children: detail.changeSummary }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm text-slate-700", "data-testid": "improvement-recap-reason", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Why it matters:" }),
                    " ",
                    detail.reasonText
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm italic text-slate-600", "data-testid": "improvement-recap-interview", children: detail.interviewAdvice })
                ]
              },
              detail.id
            )) })
          ]
        }
      )
    ] })
  ] });
}
const TEMPLATE_ALIASES = {
  ucmo: "classic",
  vibrant: "modern",
  creative: "modern",
  futuristic: "2025",
  "future-vision-2025": "2025",
  "futurevision2025": "2025",
  "resume-futuristic": "2025",
  "resume_futuristic": "2025"
};
const SUPPORTED_RESUME_TEMPLATE_IDS$1 = /* @__PURE__ */ new Set([
  "modern",
  "professional",
  "classic",
  "ats",
  "2025"
]);
const canonicalizeTemplateId$1 = (value) => {
  if (typeof value !== "string")
    return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed)
    return "";
  const normalized = trimmed.replace(/[\s_]+/g, "-");
  const alias = TEMPLATE_ALIASES[normalized] || TEMPLATE_ALIASES[trimmed];
  if (alias) {
    return alias;
  }
  if (SUPPORTED_RESUME_TEMPLATE_IDS$1.has(trimmed)) {
    return trimmed;
  }
  if (SUPPORTED_RESUME_TEMPLATE_IDS$1.has(normalized)) {
    return normalized;
  }
  if (normalized.startsWith("2025-")) {
    return "2025";
  }
  return "";
};
const BASE_TEMPLATE_OPTIONS$1 = [
  {
    id: "modern",
    name: "Modern Minimal",
    description: "Sleek two-column layout with clean dividers and ATS-safe spacing.",
    badge: "Best for Tech Roles"
  },
  {
    id: "professional",
    name: "Professional Edge",
    description: "Refined corporate styling with confident headings and balanced whitespace.",
    badge: "Best for Sr Managers"
  },
  {
    id: "classic",
    name: "Classic Heritage",
    description: "Timeless serif typography with structured section framing."
  },
  {
    id: "ats",
    name: "ATS Optimized",
    description: "Single-column structure engineered for parsing accuracy.",
    badge: "High Impact/ATS"
  },
  {
    id: "2025",
    name: "Future Vision 2025",
    description: "Futuristic grid layout with crisp typography and subtle neon cues."
  }
];
var templateRegistry = {
  TEMPLATE_ALIASES,
  SUPPORTED_RESUME_TEMPLATE_IDS: SUPPORTED_RESUME_TEMPLATE_IDS$1,
  canonicalizeTemplateId: canonicalizeTemplateId$1,
  BASE_TEMPLATE_OPTIONS: BASE_TEMPLATE_OPTIONS$1
};
const registry = /* @__PURE__ */ getDefaultExportFromCjs(templateRegistry);
const {
  canonicalizeTemplateId,
  BASE_TEMPLATE_OPTIONS,
  SUPPORTED_RESUME_TEMPLATE_IDS
} = registry;
const TEMPLATE_PREVIEW_VARIANTS = {
  modern: {
    accent: "bg-gradient-to-r from-purple-500 to-purple-600",
    highlight: "bg-purple-100",
    bullet: "bg-purple-400",
    border: "border-purple-200",
    layout: "two-column"
  },
  professional: {
    accent: "bg-blue-600",
    highlight: "bg-blue-100",
    bullet: "bg-blue-400",
    border: "border-blue-200",
    layout: "two-column"
  },
  classic: {
    accent: "bg-amber-600",
    highlight: "bg-amber-100",
    bullet: "bg-amber-400",
    border: "border-amber-200",
    layout: "two-column"
  },
  ats: {
    accent: "bg-slate-700",
    highlight: "bg-slate-200",
    bullet: "bg-slate-500",
    border: "border-slate-300",
    layout: "single-column"
  },
  "2025": {
    accent: "bg-gradient-to-r from-sky-500 to-indigo-500",
    highlight: "bg-sky-100",
    bullet: "bg-indigo-400",
    border: "border-indigo-200",
    layout: "modular"
  }
};
const DEFAULT_PREVIEW_VARIANT = {
  accent: "bg-purple-500",
  highlight: "bg-purple-100",
  bullet: "bg-purple-400",
  border: "border-purple-200",
  layout: "two-column"
};
const stripCoverPrefix = (templateId) => {
  if (typeof templateId !== "string")
    return "";
  if (templateId.startsWith("cover_")) {
    return templateId.replace(/^cover_/, "");
  }
  return templateId;
};
const getTemplatePreviewVariant = (templateId) => {
  const normalized = stripCoverPrefix(templateId);
  const canonical = canonicalizeTemplateId(normalized);
  if (canonical && TEMPLATE_PREVIEW_VARIANTS[canonical]) {
    return TEMPLATE_PREVIEW_VARIANTS[canonical];
  }
  if (typeof templateId === "string" && TEMPLATE_PREVIEW_VARIANTS[templateId]) {
    return TEMPLATE_PREVIEW_VARIANTS[templateId];
  }
  return DEFAULT_PREVIEW_VARIANT;
};
function TemplatePreviewThumbnail({ templateId, variant, testId, className }) {
  const resolvedVariant = variant || getTemplatePreviewVariant(templateId);
  const { accent, highlight, bullet, border, layout } = resolvedVariant;
  const dimensionClasses = (className == null ? void 0 : className.trim()) ? `w-full ${className.trim()}` : "h-28 w-full";
  const containerBase = `overflow-hidden rounded-xl border ${border} bg-white p-2 shadow-inner`;
  if (layout === "single-column") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `${containerBase} ${dimensionClasses} flex flex-col gap-2`,
        "data-testid": testId,
        "aria-hidden": "true",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-5 w-2/5 rounded-md ${accent}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 w-4/5 rounded-full ${highlight}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full rounded-full bg-slate-200" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-11/12 rounded-full bg-slate-200" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 w-3/5 rounded-full ${highlight}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full rounded-full bg-slate-200" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-10/12 rounded-full bg-slate-200" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-1 pt-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 rounded ${highlight}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 rounded ${highlight}` })
          ] })
        ]
      }
    );
  }
  if (layout === "modular") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `${containerBase} ${dimensionClasses} flex flex-col gap-2`,
        "data-testid": testId,
        "aria-hidden": "true",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-4 w-1/3 rounded-full ${accent}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 w-6 rounded-full ${accent}` }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 w-6 rounded-full ${highlight}` })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid flex-1 grid-cols-2 gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2 w-11/12 rounded-full ${highlight}` }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full rounded-full bg-slate-200" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-10/12 rounded-full bg-slate-200" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-8 rounded-lg ${highlight}` })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2 w-3/4 rounded-full ${accent}` }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full rounded-full bg-slate-200" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-1 pt-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-6 rounded ${highlight}` }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col justify-between rounded bg-slate-100 p-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1 rounded-full ${accent}` }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1 rounded-full ${bullet}` }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1 rounded-full ${accent}` })
                ] })
              ] })
            ] })
          ] })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `${containerBase} ${dimensionClasses} flex gap-2`,
      "data-testid": testId,
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-2/5 flex-col gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-6 w-4/5 rounded-md ${accent}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 w-3/5 rounded-full ${highlight}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1 pt-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2 w-full rounded-full ${highlight}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2 w-5/6 rounded-full ${highlight}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 pt-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1.5 w-full rounded-full ${bullet}` }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1.5 w-4/5 rounded-full ${bullet}` }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1.5 w-1.5 rounded-full ${bullet}` }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 flex-1 rounded-full bg-slate-200" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-1.5 w-1.5 rounded-full ${bullet}` }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 flex-1 rounded-full bg-slate-200" })
                ] })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-3 w-11/12 rounded-full ${accent}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full rounded-full bg-slate-200" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-10/12 rounded-full bg-slate-200" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-9/12 rounded-full bg-slate-200" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2 w-3/4 rounded-full ${highlight}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full rounded-full bg-slate-200" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-11/12 rounded-full bg-slate-200" })
          ] })
        ] })
      ]
    }
  );
}
function TemplateSelector({
  options = [],
  selectedTemplate,
  onSelect,
  disabled = false,
  historySummary = "",
  title = "Template Style",
  description = "Enhanced CVs and tailored cover letters will follow this selected design.",
  idPrefix = "template-selector"
}) {
  if (!options.length)
    return null;
  const labelId = `${idPrefix}-label`;
  const descriptionId = description ? `${idPrefix}-description` : void 0;
  const historyId = historySummary ? `${idPrefix}-history` : void 0;
  const selectedOption = options.find((option) => option.id === selectedTemplate) || null;
  const previewOption = selectedOption || options[0] || null;
  const previewVariant = getTemplatePreviewVariant(previewOption == null ? void 0 : previewOption.id);
  const handleSelect = (optionId) => {
    if (disabled || optionId === selectedTemplate)
      return;
    onSelect == null ? void 0 : onSelect(optionId);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-purple-700", id: labelId, children: title }),
      description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-600", id: descriptionId, children: description })
    ] }),
    historySummary && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-purple-500", id: historyId, children: [
      "You tried ",
      historySummary
    ] }),
    previewOption && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "space-y-2 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm",
        "data-testid": `${idPrefix}-current-preview-card`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: "Preview this style" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-purple-900", children: previewOption.name })
            ] }),
            (selectedOption == null ? void 0 : selectedOption.id) === previewOption.id && !disabled && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700", children: "Selected" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            TemplatePreviewThumbnail,
            {
              templateId: previewOption.id,
              variant: previewVariant,
              testId: `${idPrefix}-current-preview`,
              className: "h-32"
            }
          ),
          previewOption.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-600", children: previewOption.description })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        role: "radiogroup",
        "aria-labelledby": labelId,
        "aria-describedby": [descriptionId, historyId].filter(Boolean).join(" ") || void 0,
        className: "grid gap-3 sm:grid-cols-2",
        "aria-disabled": disabled || void 0,
        children: options.map((option) => {
          const isSelected = option.id === selectedTemplate;
          const variant = getTemplatePreviewVariant(option.id);
          const descriptionElementId = `${idPrefix}-${option.id}-description`;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              role: "radio",
              "aria-checked": isSelected,
              "aria-describedby": descriptionElementId,
              onClick: () => handleSelect(option.id),
              disabled,
              className: `group relative flex w-full flex-col gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${isSelected ? "border-purple-500 ring-2 ring-purple-200" : "border-purple-200 hover:border-purple-400 hover:shadow-md"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-purple-900", children: option.name }),
                  (option.badge || isSelected && !disabled) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-end gap-1 text-right", children: [
                    option.badge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700", children: option.badge }),
                    isSelected && !disabled && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700", children: "Selected" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  TemplatePreviewThumbnail,
                  {
                    templateId: option.id,
                    variant,
                    testId: `${idPrefix}-preview-${option.id}`
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-600", id: descriptionElementId, children: option.description })
              ]
            },
            option.id
          );
        })
      }
    ),
    selectedOption && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-600", "data-testid": `${idPrefix}-selected-description`, children: selectedOption.description })
  ] });
}
const COVER_TEMPLATE_STYLE_MAP = {
  cover_modern: {
    header: "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white",
    footer: "border-t border-slate-800/40 bg-slate-900/90 text-slate-100",
    border: "border-purple-200 bg-white",
    line: "bg-slate-200/80",
    highlight: "bg-purple-500/10 text-purple-800",
    badge: "bg-purple-100 text-purple-700"
  },
  cover_classic: {
    header: "bg-gradient-to-r from-amber-700 via-amber-600 to-rose-600 text-amber-50",
    footer: "border-t border-amber-200 bg-amber-100 text-amber-700",
    border: "border-amber-200 bg-amber-50/70",
    line: "bg-amber-200/80",
    highlight: "bg-amber-500/15 text-amber-900",
    badge: "bg-amber-100 text-amber-700"
  },
  cover_professional: {
    header: "bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-slate-50",
    footer: "border-t border-slate-200 bg-slate-100 text-slate-700",
    border: "border-slate-300 bg-slate-50",
    line: "bg-slate-200/80",
    highlight: "bg-blue-500/10 text-blue-900",
    badge: "bg-blue-100 text-blue-700"
  },
  cover_ats: {
    header: "bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 text-white",
    footer: "border-t border-slate-200 bg-slate-100 text-slate-700",
    border: "border-slate-200 bg-white",
    line: "bg-slate-300/70",
    highlight: "bg-slate-400/10 text-slate-700",
    badge: "bg-slate-200 text-slate-700"
  },
  cover_2025: {
    header: "bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-500 text-cyan-100",
    footer: "border-t border-slate-700 bg-slate-900 text-cyan-100",
    border: "border-slate-700 bg-slate-900 text-slate-100",
    line: "bg-slate-600/80",
    highlight: "bg-cyan-400/20 text-cyan-100",
    badge: "bg-cyan-500/30 text-cyan-100"
  }
};
const DEFAULT_COVER_TEMPLATE_STYLE = {
  header: "bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 text-white",
  footer: "border-t border-slate-200 bg-slate-100 text-slate-600",
  border: "border-slate-200 bg-white",
  line: "bg-slate-200/80",
  highlight: "bg-slate-500/10 text-slate-700",
  badge: "bg-slate-200 text-slate-600"
};
const getCoverTemplateStyle = (templateId) => {
  if (!templateId || typeof templateId !== "string") {
    return DEFAULT_COVER_TEMPLATE_STYLE;
  }
  return COVER_TEMPLATE_STYLE_MAP[templateId] || DEFAULT_COVER_TEMPLATE_STYLE;
};
const cx$1 = (...classes) => classes.filter(Boolean).join(" ");
const toTitleCase$1 = (value, fallbackLabel) => {
  if (typeof value !== "string")
    return fallbackLabel;
  const trimmed = value.trim();
  if (!trimmed)
    return fallbackLabel;
  return trimmed.split(/[-_]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
};
const collectDownloadsByTemplate = (downloadsByTemplate, normalizer) => {
  if (!downloadsByTemplate)
    return [];
  const aggregated = /* @__PURE__ */ new Map();
  const appendEntry = (templateKey, files) => {
    const normalizedId = normalizer(templateKey);
    if (!normalizedId)
      return;
    const list = Array.isArray(files) ? files.filter((file) => file && typeof file === "object") : [];
    if (!list.length)
      return;
    const existing = aggregated.get(normalizedId) || [];
    aggregated.set(normalizedId, [...existing, ...list]);
  };
  if (downloadsByTemplate instanceof Map) {
    for (const [templateKey, files] of downloadsByTemplate.entries()) {
      appendEntry(templateKey, files);
    }
  } else if (typeof downloadsByTemplate === "object") {
    Object.entries(downloadsByTemplate).forEach(([templateKey, files]) => {
      appendEntry(templateKey, files);
    });
  }
  return Array.from(aggregated.entries()).map(([templateId, files]) => ({
    templateId,
    downloads: files
  }));
};
const RESUME_TO_COVER_TEMPLATE$1 = {
  modern: "cover_modern",
  professional: "cover_professional",
  classic: "cover_classic",
  ats: "cover_ats",
  2025: "cover_2025"
};
const DEFAULT_COVER_TEMPLATE_ID = "cover_modern";
const RESUME_TEMPLATE_PREVIEWS = {
  modern: {
    accent: "from-indigo-500 via-purple-500 to-pink-500",
    container: "border-purple-200 bg-white",
    sidebar: "bg-gradient-to-b from-slate-900/90 to-slate-700/80",
    line: "bg-slate-300/80",
    highlight: "bg-purple-500/30",
    chip: "bg-purple-100 text-purple-700"
  },
  professional: {
    accent: "from-blue-700 via-slate-700 to-slate-900",
    container: "border-slate-200 bg-slate-50",
    sidebar: "bg-gradient-to-b from-blue-900/90 to-slate-800/80",
    line: "bg-slate-300/70",
    highlight: "bg-slate-700/20",
    chip: "bg-blue-100 text-blue-700"
  },
  classic: {
    accent: "from-amber-700 via-rose-500 to-rose-700",
    container: "border-amber-200 bg-amber-50/60",
    sidebar: "bg-gradient-to-b from-amber-900/90 to-rose-900/80",
    line: "bg-amber-300/60",
    highlight: "bg-amber-500/30",
    chip: "bg-amber-100 text-amber-700"
  },
  2025: {
    accent: "from-sky-500 via-cyan-400 to-emerald-400",
    container: "border-cyan-200 bg-slate-900/90 text-slate-50",
    sidebar: "bg-gradient-to-b from-slate-900 to-slate-800",
    line: "bg-slate-600/80",
    highlight: "bg-cyan-400/30",
    chip: "bg-cyan-300/40 text-cyan-100"
  },
  ats: {
    accent: "from-slate-600 via-slate-500 to-slate-400",
    container: "border-slate-200 bg-white",
    sidebar: "bg-slate-100",
    line: "bg-slate-300/80",
    highlight: "bg-slate-400/20",
    chip: "bg-slate-200 text-slate-600"
  }
};
const DEFAULT_RESUME_PREVIEW = {
  accent: "from-slate-700 via-slate-500 to-slate-400",
  container: "border-slate-200 bg-white",
  sidebar: "bg-slate-800/90",
  line: "bg-slate-300/70",
  highlight: "bg-slate-500/20",
  chip: "bg-slate-200 text-slate-600"
};
const normalizeResumeTemplateId = (value) => {
  if (typeof value !== "string")
    return "";
  const canonical = canonicalizeTemplateId(value);
  if (canonical)
    return canonical;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
};
const getResumePreviewStyle = (templateId) => {
  const canonical = canonicalizeTemplateId(templateId);
  if (!canonical) {
    return DEFAULT_RESUME_PREVIEW;
  }
  return RESUME_TEMPLATE_PREVIEWS[canonical] || DEFAULT_RESUME_PREVIEW;
};
const deriveCoverTemplateFromResume$1 = (resumeId) => {
  if (!resumeId)
    return "";
  const canonical = canonicalizeTemplateId(resumeId);
  if (!canonical)
    return "";
  return RESUME_TO_COVER_TEMPLATE$1[canonical] || "";
};
const normalizeCoverTemplateIdValue = (value) => {
  if (typeof value !== "string")
    return "";
  return value.trim().toLowerCase();
};
const ResumeMockup = ({ style = {} }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "div",
  {
    className: cx$1("relative overflow-hidden rounded-3xl border shadow-inner", style.container),
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-20 rounded-t-3xl bg-gradient-to-r", style.accent), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-4 left-6 text-white", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold tracking-wide uppercase", children: "Alex Morgan" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs opacity-80", children: "Product Manager" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-5 gap-4 p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-24 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-20 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-28 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-24 rounded-2xl p-3 text-[10px] leading-relaxed", style.highlight), children: '"Grew ARR 3x by orchestrating global product launches and data-informed iteration."' }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-16 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-24 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-16 rounded-2xl p-3 text-[10px] leading-relaxed", style.highlight), children: "Keyword-rich skills, certifications, and JD-aligned highlights land here." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-3 space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-32 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-40 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-16 rounded-2xl p-3 text-[10px] leading-relaxed", style.highlight), children: "Impact bullet points spotlight measurable wins using JD keywords." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-36 rounded-full", style.line) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-24 rounded-2xl p-3 text-[10px] leading-relaxed", style.highlight), children: "Modern typography, subtle dividers, and ATS-safe spacing keep recruiters engaged." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("absolute inset-y-20 left-0 w-20 rounded-r-3xl", style.sidebar) })
    ]
  }
);
const CoverMockup = ({ style = {} }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "div",
  {
    className: cx$1("relative flex flex-col overflow-hidden rounded-3xl border shadow-inner", style.border),
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-16 flex items-end px-6 pb-3 rounded-t-3xl", style.header), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold tracking-wide uppercase", children: "Alex Morgan" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs opacity-80", children: "alex.morgan@email.com" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 p-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-40 rounded-full", style.line) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-32 rounded-full", style.line) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-24 rounded-2xl p-4 text-[10px] leading-relaxed", style.highlight), children: "Engaging opener tailored to the role, mirroring the JD tone and priority keywords." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-36 rounded-full", style.line) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-24 rounded-2xl p-4 text-[10px] leading-relaxed", style.highlight), children: "Body paragraphs connect achievements to business outcomes, showing cultural and skills fit." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("h-3 w-28 rounded-full", style.line) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: cx$1(
            "mt-auto flex items-center justify-between px-6 py-3 text-[10px] font-semibold uppercase tracking-wide",
            style.footer || ""
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "opacity-80", children: "Thank you for your consideration" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Signature" })
          ]
        }
      )
    ]
  }
);
const ResumeCard = ({
  label,
  option,
  style = {},
  note,
  children,
  downloads = [],
  onDownloadPreview
}) => {
  const headingText = (option == null ? void 0 : option.name) || "CV Template";
  const hasDownloadActions = Array.isArray(downloads) && downloads.length > 0 && typeof onDownloadPreview === "function";
  const downloadButtonClass = "inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "space-y-4 rounded-3xl border border-purple-100 bg-white/80 p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-purple-500", children: label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-bold text-purple-800", children: headingText }),
        (option == null ? void 0 : option.description) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-purple-600", children: option.description }),
        note && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs font-semibold text-purple-500", children: note })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: cx$1(
            "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide",
            style.chip || "bg-purple-100 text-purple-700"
          ),
          children: "CV"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeMockup, { style }),
    children ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pt-2", children }) : null,
    hasDownloadActions && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-purple-100 bg-purple-50/50 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label-tight text-[11px] font-semibold text-purple-500", children: "Download options" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-2", children: downloads.map((file, index2) => {
        const key = (file == null ? void 0 : file.storageKey) || (file == null ? void 0 : file.url) || `${(file == null ? void 0 : file.type) || "file"}-${index2}`;
        const presentation = (file == null ? void 0 : file.presentation) || {};
        const fileLabel = typeof presentation.label === "string" && presentation.label || "Download";
        const badgeText = typeof presentation.badgeText === "string" ? presentation.badgeText : "";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "li",
          {
            className: "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-100 bg-white/80 px-3 py-2",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-purple-700", children: fileLabel }),
                badgeText && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] uppercase tracking-wide text-purple-500", children: badgeText })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  className: downloadButtonClass,
                  onClick: () => onDownloadPreview(file),
                  children: "Preview & download"
                }
              )
            ]
          },
          key
        );
      }) })
    ] })
  ] });
};
const CoverCard = ({
  label,
  option,
  style = {},
  note,
  children,
  downloads = [],
  onDownloadPreview
}) => {
  const headingText = (option == null ? void 0 : option.name) || "Cover Letter";
  const hasDownloadActions = Array.isArray(downloads) && downloads.length > 0 && typeof onDownloadPreview === "function";
  const downloadButtonClass = "inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "space-y-4 rounded-3xl border border-purple-100 bg-white/80 p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-purple-500", children: label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-bold text-purple-800", children: headingText }),
        (option == null ? void 0 : option.description) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-purple-600", children: option.description }),
        note && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs font-semibold text-purple-500", children: note })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: cx$1(
            "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide",
            style.badge || "bg-purple-100 text-purple-700"
          ),
          children: "Cover"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CoverMockup, { style }),
    children ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pt-2", children }) : null,
    hasDownloadActions && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-purple-100 bg-purple-50/50 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label-tight text-[11px] font-semibold text-purple-500", children: "Download options" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-2", children: downloads.map((file, index2) => {
        const key = (file == null ? void 0 : file.storageKey) || (file == null ? void 0 : file.url) || `${(file == null ? void 0 : file.type) || "file"}-${index2}`;
        const presentation = (file == null ? void 0 : file.presentation) || {};
        const fileLabel = typeof presentation.label === "string" && presentation.label || "Download";
        const badgeText = typeof presentation.badgeText === "string" ? presentation.badgeText : "";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "li",
          {
            className: "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-100 bg-white/80 px-3 py-2",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-purple-700", children: fileLabel }),
                badgeText && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] uppercase tracking-wide text-purple-500", children: badgeText })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  className: downloadButtonClass,
                  onClick: () => onDownloadPreview(file),
                  children: "Preview & download"
                }
              )
            ]
          },
          key
        );
      }) })
    ] })
  ] });
};
function TemplatePreview({
  resumeTemplateId,
  resumeTemplateName,
  resumeTemplateDescription,
  coverTemplateId,
  coverTemplateName,
  coverTemplateDescription,
  availableResumeTemplates = [],
  availableCoverTemplates = [],
  onResumeTemplateApply,
  onCoverTemplateApply,
  isCoverLinkedToResume = false,
  isApplying = false,
  showDownloadActions = false,
  resumeDownloadsByTemplate = {},
  coverDownloadsByTemplate = {},
  onDownloadPreview
}) {
  var _a;
  const normalizedResumeTemplates = reactExports.useMemo(() => {
    const registry2 = /* @__PURE__ */ new Map();
    availableResumeTemplates.forEach((option) => {
      if (!option || typeof option !== "object")
        return;
      const normalizedId = normalizeResumeTemplateId(option.id);
      if (!normalizedId)
        return;
      if (registry2.has(normalizedId))
        return;
      registry2.set(normalizedId, {
        id: normalizedId,
        name: option.name || resumeTemplateName || normalizedId,
        description: option.description || ""
      });
    });
    const normalizedPropId = normalizeResumeTemplateId(resumeTemplateId);
    if (normalizedPropId && !registry2.has(normalizedPropId)) {
      registry2.set(normalizedPropId, {
        id: normalizedPropId,
        name: resumeTemplateName || normalizedPropId,
        description: resumeTemplateDescription || ""
      });
    }
    return Array.from(registry2.values());
  }, [
    availableResumeTemplates,
    resumeTemplateDescription,
    resumeTemplateId,
    resumeTemplateName
  ]);
  const normalizedSelectedResumeId = normalizeResumeTemplateId(resumeTemplateId);
  const normalizedCoverTemplates = reactExports.useMemo(() => {
    const registry2 = /* @__PURE__ */ new Map();
    availableCoverTemplates.forEach((option) => {
      if (!option || typeof option !== "object")
        return;
      const id2 = option.id;
      if (!id2)
        return;
      if (registry2.has(id2))
        return;
      registry2.set(id2, {
        id: id2,
        name: option.name || coverTemplateName || id2,
        description: option.description || ""
      });
    });
    if (coverTemplateId && !registry2.has(coverTemplateId)) {
      registry2.set(coverTemplateId, {
        id: coverTemplateId,
        name: coverTemplateName || coverTemplateId,
        description: coverTemplateDescription || ""
      });
    }
    return Array.from(registry2.values());
  }, [
    availableCoverTemplates,
    coverTemplateDescription,
    coverTemplateId,
    coverTemplateName
  ]);
  const [previewResumeTemplateId, setPreviewResumeTemplateId] = reactExports.useState(
    normalizedSelectedResumeId || ((_a = normalizedResumeTemplates[0]) == null ? void 0 : _a.id) || ""
  );
  const [previewCoverTemplateId, setPreviewCoverTemplateId] = reactExports.useState(() => {
    var _a2, _b;
    if (coverTemplateId)
      return coverTemplateId;
    if (isCoverLinkedToResume) {
      const derived = deriveCoverTemplateFromResume$1(resumeTemplateId || ((_a2 = normalizedResumeTemplates[0]) == null ? void 0 : _a2.id)) || "";
      if (derived)
        return derived;
    }
    return ((_b = normalizedCoverTemplates[0]) == null ? void 0 : _b.id) || DEFAULT_COVER_TEMPLATE_ID;
  });
  const [resumeComparisonSelections, setResumeComparisonSelections] = reactExports.useState(() => {
    var _a2;
    const initialId = normalizedSelectedResumeId || ((_a2 = normalizedResumeTemplates[0]) == null ? void 0 : _a2.id);
    return initialId ? [initialId] : [];
  });
  const [coverComparisonSelections, setCoverComparisonSelections] = reactExports.useState(() => {
    var _a2;
    const initialId = coverTemplateId || ((_a2 = normalizedCoverTemplates[0]) == null ? void 0 : _a2.id);
    return initialId ? [initialId] : [];
  });
  reactExports.useEffect(() => {
    if (!resumeTemplateId)
      return;
    const nextId = normalizeResumeTemplateId(resumeTemplateId);
    setPreviewResumeTemplateId(nextId);
  }, [resumeTemplateId]);
  reactExports.useEffect(() => {
    if (!coverTemplateId)
      return;
    setPreviewCoverTemplateId(coverTemplateId);
  }, [coverTemplateId]);
  reactExports.useEffect(() => {
    setResumeComparisonSelections((prev) => {
      if (!(prev == null ? void 0 : prev.length))
        return prev;
      const validOptions = new Set(normalizedResumeTemplates.map((option) => option.id));
      const filtered = prev.filter((id2) => validOptions.has(id2));
      return filtered.length ? filtered : [];
    });
  }, [normalizedResumeTemplates]);
  reactExports.useEffect(() => {
    setCoverComparisonSelections((prev) => {
      if (!(prev == null ? void 0 : prev.length))
        return prev;
      const validOptions = new Set(normalizedCoverTemplates.map((option) => option.id));
      const filtered = prev.filter((id2) => validOptions.has(id2));
      return filtered.length ? filtered : [];
    });
  }, [normalizedCoverTemplates]);
  const previewResumeOption = reactExports.useMemo(() => {
    return normalizedResumeTemplates.find((option) => option.id === previewResumeTemplateId) || normalizedResumeTemplates[0] || {
      id: normalizedSelectedResumeId,
      name: resumeTemplateName,
      description: resumeTemplateDescription
    };
  }, [
    normalizedResumeTemplates,
    previewResumeTemplateId,
    resumeTemplateDescription,
    normalizedSelectedResumeId,
    resumeTemplateName
  ]);
  const previewResumeOptionId = (previewResumeOption == null ? void 0 : previewResumeOption.id) || "";
  reactExports.useEffect(() => {
    var _a2;
    if (!isCoverLinkedToResume)
      return;
    const derivedFromPreview = deriveCoverTemplateFromResume$1(previewResumeOptionId || previewResumeTemplateId) || deriveCoverTemplateFromResume$1(resumeTemplateId);
    const fallbackCoverId = coverTemplateId || ((_a2 = normalizedCoverTemplates[0]) == null ? void 0 : _a2.id) || DEFAULT_COVER_TEMPLATE_ID;
    const nextCoverId = derivedFromPreview || fallbackCoverId;
    if (nextCoverId && nextCoverId !== previewCoverTemplateId) {
      setPreviewCoverTemplateId(nextCoverId);
    }
  }, [
    coverTemplateId,
    isCoverLinkedToResume,
    normalizedCoverTemplates,
    previewCoverTemplateId,
    previewResumeOptionId,
    previewResumeTemplateId,
    resumeTemplateId
  ]);
  const previewCoverOption = reactExports.useMemo(() => {
    return normalizedCoverTemplates.find((option) => option.id === previewCoverTemplateId) || normalizedCoverTemplates[0] || {
      id: coverTemplateId,
      name: coverTemplateName,
      description: coverTemplateDescription
    };
  }, [
    coverTemplateDescription,
    coverTemplateId,
    coverTemplateName,
    normalizedCoverTemplates,
    previewCoverTemplateId
  ]);
  const appliedResumeOption = reactExports.useMemo(() => {
    const normalizedId = normalizeResumeTemplateId(resumeTemplateId);
    if (!normalizedId)
      return null;
    return normalizedResumeTemplates.find((option) => option.id === normalizedId) || {
      id: normalizedId,
      name: resumeTemplateName || normalizedId,
      description: resumeTemplateDescription || ""
    };
  }, [
    normalizedResumeTemplates,
    resumeTemplateDescription,
    resumeTemplateId,
    resumeTemplateName
  ]);
  const appliedCoverOption = reactExports.useMemo(() => {
    if (!coverTemplateId)
      return null;
    return normalizedCoverTemplates.find((option) => option.id === coverTemplateId) || {
      id: coverTemplateId,
      name: coverTemplateName || coverTemplateId,
      description: coverTemplateDescription || ""
    };
  }, [
    coverTemplateDescription,
    coverTemplateId,
    coverTemplateName,
    normalizedCoverTemplates
  ]);
  const resumeStyle = getResumePreviewStyle(previewResumeOption == null ? void 0 : previewResumeOption.id);
  const coverStyle = getCoverTemplateStyle(previewCoverOption == null ? void 0 : previewCoverOption.id) || DEFAULT_COVER_TEMPLATE_STYLE;
  const appliedResumeStyle = getResumePreviewStyle(appliedResumeOption == null ? void 0 : appliedResumeOption.id);
  const appliedCoverStyle = getCoverTemplateStyle(appliedCoverOption == null ? void 0 : appliedCoverOption.id) || DEFAULT_COVER_TEMPLATE_STYLE;
  const appliedResumeName = (appliedResumeOption == null ? void 0 : appliedResumeOption.name) || resumeTemplateName || normalizedSelectedResumeId || "your current CV style";
  const appliedCoverName = (appliedCoverOption == null ? void 0 : appliedCoverOption.name) || coverTemplateName || coverTemplateId || "your current cover style";
  const independentCoverDescriptor = reactExports.useMemo(() => {
    if (!appliedCoverName || typeof appliedCoverName !== "string") {
      return "your selected cover letter style";
    }
    const trimmed = appliedCoverName.trim();
    if (!trimmed) {
      return "your selected cover letter style";
    }
    if (/cover/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed} cover letter style`;
  }, [appliedCoverName]);
  const isPreviewingDifferentResume = (previewResumeOption == null ? void 0 : previewResumeOption.id) && normalizedSelectedResumeId && previewResumeOption.id !== normalizedSelectedResumeId;
  const isPreviewingDifferentCover = (previewCoverOption == null ? void 0 : previewCoverOption.id) && coverTemplateId && previewCoverOption.id !== coverTemplateId;
  const normalizedResumeComparisonSelections = reactExports.useMemo(() => {
    if (!(resumeComparisonSelections == null ? void 0 : resumeComparisonSelections.length))
      return [];
    const unique = Array.from(new Set(resumeComparisonSelections));
    const resolved = unique.map((id2) => normalizedResumeTemplates.find((option) => option.id === id2)).filter(Boolean).slice(0, 2);
    return resolved;
  }, [resumeComparisonSelections, normalizedResumeTemplates]);
  const normalizedCoverComparisonSelections = reactExports.useMemo(() => {
    if (!(coverComparisonSelections == null ? void 0 : coverComparisonSelections.length))
      return [];
    const unique = Array.from(new Set(coverComparisonSelections));
    const resolved = unique.map((id2) => normalizedCoverTemplates.find((option) => option.id === id2)).filter(Boolean).slice(0, 2);
    return resolved;
  }, [coverComparisonSelections, normalizedCoverTemplates]);
  const hasCustomResumeComparison = normalizedResumeComparisonSelections.length >= 2;
  const hasCustomCoverComparison = normalizedCoverComparisonSelections.length >= 2;
  const resumeDownloadEntries = reactExports.useMemo(() => {
    if (!showDownloadActions)
      return [];
    return collectDownloadsByTemplate(resumeDownloadsByTemplate, normalizeResumeTemplateId);
  }, [resumeDownloadsByTemplate, showDownloadActions]);
  const coverDownloadEntries = reactExports.useMemo(() => {
    if (!showDownloadActions)
      return [];
    return collectDownloadsByTemplate(coverDownloadsByTemplate, normalizeCoverTemplateIdValue);
  }, [coverDownloadsByTemplate, showDownloadActions]);
  const resolveResumeDownloads = (templateId) => {
    if (!showDownloadActions)
      return [];
    const normalizedId = normalizeResumeTemplateId(templateId);
    if (!normalizedId)
      return [];
    if (!resumeDownloadsByTemplate)
      return [];
    if (resumeDownloadsByTemplate instanceof Map) {
      const entry2 = resumeDownloadsByTemplate.get(normalizedId);
      return Array.isArray(entry2) ? entry2 : [];
    }
    const entry = resumeDownloadsByTemplate == null ? void 0 : resumeDownloadsByTemplate[normalizedId];
    return Array.isArray(entry) ? entry : [];
  };
  const resolveCoverDownloads = (templateId) => {
    if (!showDownloadActions)
      return [];
    const normalizedId = normalizeCoverTemplateIdValue(templateId);
    if (!normalizedId)
      return [];
    if (!coverDownloadsByTemplate)
      return [];
    if (coverDownloadsByTemplate instanceof Map) {
      const entry2 = coverDownloadsByTemplate.get(normalizedId);
      return Array.isArray(entry2) ? entry2 : [];
    }
    const entry = coverDownloadsByTemplate == null ? void 0 : coverDownloadsByTemplate[normalizedId];
    return Array.isArray(entry) ? entry : [];
  };
  const toggleResumeComparisonSelection = (templateId) => {
    const normalizedId = normalizeResumeTemplateId(templateId);
    if (!normalizedId)
      return;
    setResumeComparisonSelections((prev = []) => {
      const exists = prev.includes(normalizedId);
      let next = exists ? prev.filter((id2) => id2 !== normalizedId) : [...prev, normalizedId];
      if (next.length > 2) {
        next = next.slice(next.length - 2);
      }
      return next;
    });
  };
  const toggleCoverComparisonSelection = (templateId) => {
    if (!templateId)
      return;
    setCoverComparisonSelections((prev = []) => {
      const exists = prev.includes(templateId);
      let next = exists ? prev.filter((id2) => id2 !== templateId) : [...prev, templateId];
      if (next.length > 2) {
        next = next.slice(next.length - 2);
      }
      return next;
    });
  };
  const baseResumeCards = hasCustomResumeComparison ? normalizedResumeComparisonSelections.map((option, index2) => {
    const style = getResumePreviewStyle(option == null ? void 0 : option.id);
    const isApplied = (option == null ? void 0 : option.id) === normalizedSelectedResumeId;
    return {
      key: (option == null ? void 0 : option.id) || `resume-comparison-${index2}`,
      label: `Comparison choice ${index2 + 1}`,
      option,
      style,
      note: isApplied ? "This template is currently selected for your downloads." : "Apply this template to use it for your downloads.",
      canApply: !isApplied && Boolean(onResumeTemplateApply),
      downloads: resolveResumeDownloads(option == null ? void 0 : option.id)
    };
  }) : [
    ...isPreviewingDifferentResume && appliedResumeOption ? [
      {
        key: appliedResumeOption.id,
        label: "Currently selected CV",
        option: appliedResumeOption,
        style: appliedResumeStyle,
        note: "This is the template currently used for your downloads.",
        canApply: false,
        downloads: resolveResumeDownloads(appliedResumeOption == null ? void 0 : appliedResumeOption.id)
      }
    ] : []
  ];
  const resumeCardTemplateIds = new Set(
    baseResumeCards.map((card) => {
      var _a2;
      return (_a2 = card.option) == null ? void 0 : _a2.id;
    }).filter(Boolean)
  );
  if (previewResumeOption == null ? void 0 : previewResumeOption.id) {
    resumeCardTemplateIds.add(previewResumeOption.id);
  }
  const additionalResumeCards = showDownloadActions ? resumeDownloadEntries.filter(
    ({ templateId, downloads }) => templateId && (downloads == null ? void 0 : downloads.length) && !resumeCardTemplateIds.has(templateId)
  ).map(({ templateId, downloads }) => {
    const option = normalizedResumeTemplates.find((item) => item.id === templateId) || {
      id: templateId,
      name: toTitleCase$1(templateId, "CV Template"),
      description: ""
    };
    const style = getResumePreviewStyle(templateId);
    const isApplied = templateId === normalizedSelectedResumeId;
    return {
      key: `download-resume-${templateId}`,
      label: "Download-ready CV",
      option,
      style,
      note: isApplied ? "This template is currently selected for your downloads." : "Preview this CV style above to apply it to your downloads.",
      canApply: !isApplied && Boolean(onResumeTemplateApply),
      downloads
    };
  }) : [];
  const resumeCards = showDownloadActions ? [...baseResumeCards, ...additionalResumeCards] : baseResumeCards;
  const baseCoverCards = hasCustomCoverComparison ? normalizedCoverComparisonSelections.map((option, index2) => {
    const style = getCoverTemplateStyle(option == null ? void 0 : option.id) || DEFAULT_COVER_TEMPLATE_STYLE;
    const isApplied = (option == null ? void 0 : option.id) === coverTemplateId;
    return {
      key: (option == null ? void 0 : option.id) || `cover-comparison-${index2}`,
      label: `Comparison choice ${index2 + 1}`,
      option,
      style,
      note: isApplied ? "This cover letter style is currently selected for your downloads." : isCoverLinkedToResume ? "Apply this cover letter style to break the sync with your CV template and use it for your downloads." : "Apply this cover letter style to use it for your downloads.",
      canApply: !isApplied && Boolean(onCoverTemplateApply),
      downloads: resolveCoverDownloads(option == null ? void 0 : option.id)
    };
  }) : [
    ...isPreviewingDifferentCover && appliedCoverOption ? [
      {
        key: appliedCoverOption.id,
        label: "Currently selected cover letter",
        option: appliedCoverOption,
        style: appliedCoverStyle,
        note: "This is the template currently used for your downloads.",
        canApply: false,
        downloads: resolveCoverDownloads(appliedCoverOption == null ? void 0 : appliedCoverOption.id)
      }
    ] : []
  ];
  const coverCardTemplateIds = new Set(
    baseCoverCards.map((card) => {
      var _a2;
      return (_a2 = card.option) == null ? void 0 : _a2.id;
    }).filter(Boolean)
  );
  if (previewCoverOption == null ? void 0 : previewCoverOption.id) {
    coverCardTemplateIds.add(previewCoverOption.id);
  }
  const additionalCoverCards = showDownloadActions ? coverDownloadEntries.filter(
    ({ templateId, downloads }) => templateId && (downloads == null ? void 0 : downloads.length) && !coverCardTemplateIds.has(templateId)
  ).map(({ templateId, downloads }) => {
    const option = normalizedCoverTemplates.find((item) => item.id === templateId) || {
      id: templateId,
      name: toTitleCase$1(templateId, "Cover Letter"),
      description: ""
    };
    const style = getCoverTemplateStyle(templateId) || DEFAULT_COVER_TEMPLATE_STYLE;
    const isApplied = templateId === coverTemplateId;
    const note = isApplied ? "This cover letter style is currently selected for your downloads." : isCoverLinkedToResume ? "Preview this cover letter style to sync it with your selected CV downloads." : "Preview this cover letter style to use it for your downloads.";
    return {
      key: `download-cover-${templateId}`,
      label: "Download-ready cover letter",
      option,
      style,
      note,
      canApply: !isApplied && Boolean(onCoverTemplateApply),
      downloads
    };
  }) : [];
  const coverCards = showDownloadActions ? [...baseCoverCards, ...additionalCoverCards] : baseCoverCards;
  const resumeGridColumns = hasCustomResumeComparison ? "md:grid-cols-2" : resumeCards.length > 1 ? "md:grid-cols-2" : "grid-cols-1";
  const coverGridColumns = hasCustomCoverComparison ? "md:grid-cols-2" : coverCards.length > 1 ? "md:grid-cols-2" : "grid-cols-1";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-3xl border border-purple-100 bg-white/80 shadow-xl p-6 space-y-6", "aria-label": "Template previews", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-purple-800", children: "Preview Your Look & Feel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-600", children: "See how your enhanced CV and cover letter will be styled before you download them." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "caps-label text-xs font-semibold text-purple-500", children: "Live Preview" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-6 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResumeCard,
          {
            label: "CV Template Preview",
            option: previewResumeOption,
            style: resumeStyle,
            note: isPreviewingDifferentResume ? `Currently applied: ${appliedResumeName}. Compare them below before updating.` : "This template is already applied to your downloads.",
            downloads: resolveResumeDownloads(previewResumeOption == null ? void 0 : previewResumeOption.id),
            onDownloadPreview,
            children: isPreviewingDifferentResume && onResumeTemplateApply && (previewResumeOption == null ? void 0 : previewResumeOption.id) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: "inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-60",
                onClick: () => onResumeTemplateApply(previewResumeOption.id),
                disabled: isApplying,
                children: isApplying ? "Updating…" : "Use this CV style"
              }
            ) : null
          }
        ),
        normalizedResumeTemplates.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "grid gap-3 sm:grid-cols-2",
              role: "group",
              "aria-label": "Preview CV templates",
              children: normalizedResumeTemplates.map((option) => {
                const isActive = option.id === (previewResumeOption == null ? void 0 : previewResumeOption.id);
                const variant = getTemplatePreviewVariant(option.id);
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "button",
                    className: cx$1(
                      "flex w-full flex-col gap-2 rounded-2xl border bg-white p-3 text-left text-purple-600 transition focus:outline-none focus:ring-2 focus:ring-purple-300",
                      isActive ? "border-purple-400 bg-purple-50/60 text-purple-700 shadow-sm" : "border-purple-200 hover:border-purple-300 hover:shadow-sm"
                    ),
                    onClick: () => setPreviewResumeTemplateId(normalizeResumeTemplateId(option.id)),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        TemplatePreviewThumbnail,
                        {
                          templateId: option.id,
                          variant,
                          testId: `resume-preview-thumbnail-${option.id}`,
                          className: "h-20"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-purple-700", children: option.name }),
                        option.id === resumeTemplateId && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700", children: "Selected" })
                      ] })
                    ]
                  },
                  option.id
                );
              })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-purple-100 bg-purple-50/40 p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label-tight text-[11px] font-semibold text-purple-500", children: "Compare CV templates" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-purple-600", children: "Pick two styles to see them side-by-side before applying." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 flex flex-wrap gap-3", role: "group", "aria-label": "Select CV templates to compare", children: normalizedResumeTemplates.map((option) => {
              const isSelected = resumeComparisonSelections.includes(option.id);
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "label",
                {
                  className: cx$1(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition focus-within:outline-none focus-within:ring-2 focus-within:ring-purple-300",
                    isSelected ? "border-purple-400 bg-white text-purple-700 shadow-sm" : "border-purple-200 bg-white/70 text-purple-500 hover:border-purple-300 hover:text-purple-600"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "checkbox",
                        className: "h-3 w-3 rounded border-purple-300 text-purple-500 focus:ring-purple-400",
                        checked: isSelected,
                        onChange: () => toggleResumeComparisonSelection(option.id),
                        "aria-label": `Compare ${option.name} CV template`
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: option.name })
                  ]
                },
                `resume-compare-${option.id}`
              );
            }) }),
            hasCustomResumeComparison ? null : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[10px] text-purple-500", children: "Select two templates to activate the comparison view." })
          ] })
        ] }),
        resumeCards.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("grid gap-4", resumeGridColumns), children: resumeCards.map(({ key, label, option, style, note, canApply, downloads }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResumeCard,
          {
            label,
            option,
            style,
            note,
            downloads,
            onDownloadPreview,
            children: canApply && (option == null ? void 0 : option.id) && onResumeTemplateApply && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: "inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-60",
                onClick: () => onResumeTemplateApply(option.id),
                disabled: isApplying,
                children: isApplying ? "Updating…" : "Use this CV style"
              }
            )
          },
          key
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          CoverCard,
          {
            label: "Cover Letter Preview",
            option: previewCoverOption,
            style: coverStyle,
            note: isPreviewingDifferentCover ? `Currently applied: ${appliedCoverName}. Compare styles below before updating.` : "This template is already applied to your downloads.",
            downloads: resolveCoverDownloads(previewCoverOption == null ? void 0 : previewCoverOption.id),
            onDownloadPreview,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-500", children: isCoverLinkedToResume ? "Cover letters stay synced with your CV until you pick a new style or turn off “Match CV style”." : `Cover letters stay in the ${independentCoverDescriptor} even if you swap CV templates.` }),
              isPreviewingDifferentCover && onCoverTemplateApply && (previewCoverOption == null ? void 0 : previewCoverOption.id) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  className: "mt-3 inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-60",
                  onClick: () => onCoverTemplateApply(previewCoverOption.id),
                  disabled: isApplying,
                  children: isApplying ? "Updating…" : "Use this cover style"
                }
              ) : null
            ]
          }
        ),
        normalizedCoverTemplates.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "grid gap-3 sm:grid-cols-2",
              role: "group",
              "aria-label": "Preview cover letter templates",
              children: normalizedCoverTemplates.map((option) => {
                const isActive = option.id === (previewCoverOption == null ? void 0 : previewCoverOption.id);
                const variant = getTemplatePreviewVariant(option.id);
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "button",
                    className: cx$1(
                      "flex w-full flex-col gap-2 rounded-2xl border bg-white p-3 text-left text-purple-600 transition focus:outline-none focus:ring-2 focus:ring-purple-300",
                      isActive ? "border-purple-400 bg-purple-50/60 text-purple-700 shadow-sm" : "border-purple-200 hover:border-purple-300 hover:shadow-sm"
                    ),
                    onClick: () => setPreviewCoverTemplateId(option.id),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        TemplatePreviewThumbnail,
                        {
                          templateId: option.id,
                          variant,
                          testId: `cover-preview-thumbnail-${option.id}`,
                          className: "h-20"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-purple-700", children: option.name }),
                        option.id === coverTemplateId && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700", children: "Selected" })
                      ] })
                    ]
                  },
                  option.id
                );
              })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-purple-100 bg-purple-50/40 p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label-tight text-[11px] font-semibold text-purple-500", children: "Compare cover letter templates" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-purple-600", children: "Pick two styles to review side-by-side before applying." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 flex flex-wrap gap-3", role: "group", "aria-label": "Select cover letter templates to compare", children: normalizedCoverTemplates.map((option) => {
              const isSelected = coverComparisonSelections.includes(option.id);
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "label",
                {
                  className: cx$1(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition focus-within:outline-none focus-within:ring-2 focus-within:ring-purple-300",
                    isSelected ? "border-purple-400 bg-white text-purple-700 shadow-sm" : "border-purple-200 bg-white/70 text-purple-500 hover:border-purple-300 hover:text-purple-600"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "checkbox",
                        className: "h-3 w-3 rounded border-purple-300 text-purple-500 focus:ring-purple-400",
                        checked: isSelected,
                        onChange: () => toggleCoverComparisonSelection(option.id),
                        "aria-label": `Compare ${option.name} cover letter template`
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: option.name })
                  ]
                },
                `cover-compare-${option.id}`
              );
            }) }),
            hasCustomCoverComparison ? null : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[10px] text-purple-500", children: "Select two templates to activate the comparison view." })
          ] })
        ] }),
        coverCards.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cx$1("grid gap-4", coverGridColumns), children: coverCards.map(({ key, label, option, style, note, canApply, downloads }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          CoverCard,
          {
            label,
            option,
            style,
            note,
            downloads,
            onDownloadPreview,
            children: canApply && (option == null ? void 0 : option.id) && onCoverTemplateApply && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: "inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-60",
                onClick: () => onCoverTemplateApply(option.id),
                disabled: isApplying,
                children: isApplying ? "Updating…" : "Use this cover style"
              }
            )
          },
          key
        )) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-500", children: "Tap through the template chips or choose two templates to compare side-by-side and lock in your favourite look before downloading." })
  ] });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = TemplatePreview;
  module.exports.default = TemplatePreview;
}
function TemplatePicker({
  context = "improvements",
  resumeOptions = [],
  resumeHistorySummary = "",
  selectedResumeTemplateId,
  selectedResumeTemplateName,
  selectedResumeTemplateDescription = "",
  onResumeTemplateSelect,
  coverOptions = [],
  selectedCoverTemplateId,
  selectedCoverTemplateName,
  selectedCoverTemplateDescription = "",
  onCoverTemplateSelect,
  isCoverLinkedToResume = true,
  onCoverLinkToggle,
  disabled = false,
  isApplying = false,
  showDownloadActions = false,
  resumeDownloadsByTemplate = {},
  coverDownloadsByTemplate = {},
  onDownloadPreview
}) {
  const resumeSelectorIdPrefix = context === "downloads" ? "download-resume-template-selector" : "resume-template-selector";
  const coverSelectorIdPrefix = context === "downloads" ? "download-cover-template-selector" : "cover-template-selector";
  const hasResumeOptions = Array.isArray(resumeOptions) && resumeOptions.length > 0;
  const hasCoverOptions = Array.isArray(coverOptions) && coverOptions.length > 0;
  const showPreview = hasResumeOptions || hasCoverOptions;
  const normalizedCoverTemplateName = (() => {
    if (typeof selectedCoverTemplateName !== "string") {
      return "your selected cover letter style";
    }
    const trimmed = selectedCoverTemplateName.trim();
    return trimmed || "your selected cover letter style";
  })();
  const coverSelectorDescription = isCoverLinkedToResume ? "Cover letters mirror your selected CV template. Choose another style or switch off “Match CV style” to decouple them." : `Cover letters stay in the ${normalizedCoverTemplateName} design even if your CV uses another template. Pick a new style whenever you like.`;
  const coverLinkHelperText = isCoverLinkedToResume ? "Uncheck or pick a new cover letter template to mix and match styles." : "Cover letters stay in this design when you swap CV templates.";
  const handleCoverLinkChange = (event) => {
    const nextValue = event.target.checked;
    onCoverLinkToggle == null ? void 0 : onCoverLinkToggle(nextValue);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    hasResumeOptions && /* @__PURE__ */ jsxRuntimeExports.jsx(
      TemplateSelector,
      {
        idPrefix: resumeSelectorIdPrefix,
        title: "CV Template Style",
        description: "Choose the CV aesthetic that mirrors your personality and the JD tone.",
        options: resumeOptions,
        selectedTemplate: selectedResumeTemplateId,
        onSelect: onResumeTemplateSelect,
        disabled,
        historySummary: resumeHistorySummary
      }
    ),
    hasCoverOptions && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
      typeof onCoverLinkToggle === "function" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-purple-100 bg-purple-50/50 p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            className: "mt-1 h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-400",
            checked: isCoverLinkedToResume,
            onChange: handleCoverLinkChange,
            disabled
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-sm font-semibold text-purple-700", children: "Match cover letter style to CV template" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 block text-xs text-purple-600", children: coverLinkHelperText })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        TemplateSelector,
        {
          idPrefix: coverSelectorIdPrefix,
          title: "Cover Letter Template",
          description: coverSelectorDescription,
          options: coverOptions,
          selectedTemplate: selectedCoverTemplateId,
          onSelect: onCoverTemplateSelect,
          disabled
        }
      )
    ] }),
    showPreview && /* @__PURE__ */ jsxRuntimeExports.jsx(
      TemplatePreview,
      {
        resumeTemplateId: selectedResumeTemplateId,
        resumeTemplateName: selectedResumeTemplateName,
        resumeTemplateDescription: selectedResumeTemplateDescription,
        coverTemplateId: selectedCoverTemplateId,
        coverTemplateName: selectedCoverTemplateName,
        coverTemplateDescription: selectedCoverTemplateDescription,
        availableResumeTemplates: resumeOptions,
        availableCoverTemplates: coverOptions,
        onResumeTemplateApply: onResumeTemplateSelect,
        onCoverTemplateApply: onCoverTemplateSelect,
        isCoverLinkedToResume,
        isApplying,
        showDownloadActions,
        resumeDownloadsByTemplate,
        coverDownloadsByTemplate,
        onDownloadPreview
      }
    )
  ] });
}
const categories = [
  {
    key: "skills",
    label: "JD Skills",
    description: "Core JD keywords covered or still missing from your resume."
  },
  {
    key: "designation",
    label: "Designation",
    description: "Visible job titles aligned to the target role."
  },
  {
    key: "experience",
    label: "Experience",
    description: "Tenure signals and quantified achievements surfaced from work history."
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "Responsibilities and project outcomes aligned to the JD expectations."
  },
  {
    key: "highlights",
    label: "Highlights",
    description: "Summary hooks and spotlight wins emphasised for this role."
  },
  {
    key: "certificates",
    label: "Certifications",
    description: "Credential coverage detected across LinkedIn, resume, and manual inputs."
  }
];
const addedBadgeClass = "bg-emerald-100 text-emerald-700 border border-emerald-200";
const missingBadgeClass = "bg-rose-100 text-rose-700 border border-rose-200";
const actionBadgeClass = "caps-label-tight inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-[0.65rem] font-semibold text-purple-700";
function normaliseItemLabel(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : "";
}
function collectSummaryItems(summary, type) {
  const list = [];
  const seen = /* @__PURE__ */ new Set();
  categories.forEach((category) => {
    const bucket = summary == null ? void 0 : summary[category.key];
    const items = Array.isArray(bucket == null ? void 0 : bucket[type]) ? bucket[type] : [];
    items.forEach((item) => {
      const label = normaliseItemLabel(item);
      if (!label)
        return;
      const dedupeKey = `${category.key}::${label.toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      list.push({
        categoryKey: category.key,
        categoryLabel: category.label,
        value: label
      });
    });
  });
  return list;
}
function renderSummaryChips(items, type) {
  if (!Array.isArray(items) || items.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-xs text-slate-500", children: type === "added" ? "No new signals recorded yet." : "No gaps flagged right now." });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 flex flex-wrap gap-2", children: items.map((item) => {
    const badgeLabel = typeof item.categoryLabel === "string" ? item.categoryLabel.replace(/\s+/g, " ") : item.categoryLabel;
    const valueLabel = typeof item.value === "string" && item.value ? `${item.value} (${type === "added" ? "added" : "missing"})` : item.value;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "li",
      {
        className: `inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${type === "added" ? "border-emerald-200 bg-emerald-50/80 text-emerald-700" : "border-rose-200 bg-rose-50/80 text-rose-700"}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              "aria-hidden": "true",
              className: "rounded-full bg-white/70 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-current",
              children: badgeLabel ? `${badgeLabel}:` : ""
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: valueLabel })
        ]
      },
      `${type}-${item.categoryKey}-${item.value}`
    );
  }) });
}
function renderItems(items, type, label) {
  if (!Array.isArray(items) || items.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-purple-700/70", children: type === "added" ? `No new ${label.toLowerCase()} added yet.` : `No missing ${label.toLowerCase()} detected.` });
  }
  const visible = items.slice(0, 6);
  const remainder = items.length - visible.length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "mt-2 flex flex-wrap gap-2", children: [
    visible.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "li",
      {
        className: `rounded-full px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur ${type === "added" ? addedBadgeClass : missingBadgeClass}`,
        children: item
      },
      `${type}-${item}`
    )),
    remainder > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "rounded-full border border-purple-200 bg-white/70 px-3 py-1 text-xs font-semibold text-purple-700", children: [
      "+",
      remainder,
      " more"
    ] })
  ] });
}
function DeltaSummaryPanel({ summary }) {
  if (!summary) {
    return null;
  }
  const addedItems = collectSummaryItems(summary, "added");
  const missingItems = collectSummaryItems(summary, "missing");
  const addedVisible = addedItems.slice(0, 6);
  const missingVisible = missingItems.slice(0, 6);
  const addedRemainder = Math.max(addedItems.length - addedVisible.length, 0);
  const missingRemainder = Math.max(missingItems.length - missingVisible.length, 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "space-y-6 rounded-3xl border border-purple-200/70 bg-white/85 p-6 shadow-xl",
      "aria-labelledby": "delta-summary-title",
      "data-testid": "delta-summary-panel",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "delta-summary-title", className: "text-xl font-semibold text-purple-900", children: "Immediate Match Deltas" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Instantly review what new signals were added and which gaps still need attention across critical categories." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "rounded-2xl border border-rose-200/70 bg-rose-50/60 p-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-rose-600", children: "Before updates" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-rose-600/80", children: "Gaps the JD still expects you to cover." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 text-3xl font-semibold text-rose-700", children: [
              missingItems.length,
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2 text-sm font-medium text-rose-600/90", children: missingItems.length === 1 ? "gap flagged" : "gaps flagged" })
            ] }),
            renderSummaryChips(missingVisible, "missing"),
            missingRemainder > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs font-semibold text-rose-600/80", children: [
              "+",
              missingRemainder,
              " more gaps identified"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-emerald-600", children: "After enhancements" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-emerald-600/80", children: "Signals newly added from accepted updates." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 text-3xl font-semibold text-emerald-700", children: [
              addedItems.length,
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2 text-sm font-medium text-emerald-700/90", children: addedItems.length === 1 ? "signal added" : "signals added" })
            ] }),
            renderSummaryChips(addedVisible, "added"),
            addedRemainder > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs font-semibold text-emerald-700/80", children: [
              "+",
              addedRemainder,
              " more signals captured"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", children: categories.map((category) => {
          const bucket = summary[category.key] || { added: [], missing: [] };
          const advice = buildCategoryAdvice(category.key, bucket);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "article",
            {
              className: "flex h-full flex-col justify-between gap-3 rounded-2xl border border-purple-100/70 bg-white/70 p-4 shadow-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-purple-900", children: category.label }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/75", children: category.description })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-emerald-600", children: "Added" }),
                    renderItems(bucket.added, "added", category.label)
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-rose-600", children: "Missing" }),
                    renderItems(bucket.missing, "missing", category.label)
                  ] })
                ] }),
                advice && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm leading-relaxed text-purple-900/80", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: actionBadgeClass, children: "Action" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2 align-middle", children: advice })
                ] })
              ]
            },
            category.key
          );
        }) })
      ]
    }
  );
}
const statusThemes = {
  complete: {
    card: "border-emerald-200 bg-emerald-50/80 shadow-sm",
    circle: "bg-emerald-500 border-emerald-500 text-white",
    title: "text-emerald-900",
    description: "text-emerald-700/90",
    status: "text-emerald-600"
  },
  current: {
    card: "border-indigo-300 bg-white shadow-lg ring-1 ring-indigo-200/70",
    circle: "bg-indigo-500 border-indigo-500 text-white",
    title: "text-indigo-900",
    description: "text-indigo-700/90",
    status: "text-indigo-600"
  },
  upcoming: {
    card: "border-purple-100 bg-white/70",
    circle: "border-2 border-dashed border-purple-300 text-purple-400",
    title: "text-purple-800",
    description: "text-purple-600/80",
    status: "text-purple-400"
  }
};
const noteToneStyles = {
  warning: "text-rose-600 font-semibold",
  success: "text-emerald-600 font-semibold",
  info: "text-indigo-600 font-medium"
};
function ProcessFlow({ steps }) {
  const items = Array.isArray(steps) ? steps.filter(Boolean) : [];
  if (items.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-3xl border border-purple-200/60 bg-white/80 p-5 shadow-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-purple-500", children: "Step-by-step flow" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "mt-4 grid gap-3 md:grid-cols-5", children: items.map((step, index2) => {
      const theme = statusThemes[step.status] || statusThemes.upcoming;
      const statusLabel = step.status === "complete" ? "Complete" : step.status === "current" ? "In progress" : "Pending";
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "li",
        {
          className: `flex h-full flex-col gap-3 rounded-2xl border p-4 transition ${theme.card}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${theme.circle}`,
                  children: step.status === "complete" ? "✓" : index2 + 1
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm font-semibold uppercase tracking-wide ${theme.title}`, children: step.label }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-xs font-medium ${theme.status}`, children: statusLabel })
              ] })
            ] }),
            step.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-sm leading-relaxed ${theme.description}`, children: step.description }),
            step.note && step.note.trim() && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-xs ${noteToneStyles[step.noteTone] || noteToneStyles.info}`, children: step.note })
          ]
        },
        step.key || step.label || index2
      );
    }) })
  ] });
}
const viewOptions = [
  { key: "split", label: "Side by side" },
  { key: "stack", label: "Sequential" }
];
const itemizedChangeTypeLabels = {
  added: "Added",
  removed: "Removed",
  replaced: "Replaced"
};
const itemizedChangeTypeStyles = {
  added: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  removed: "bg-rose-100 text-rose-700 border border-rose-200",
  replaced: "bg-indigo-100 text-indigo-700 border border-indigo-200"
};
const summaryActionBadgeClass = "caps-label-tight inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[0.6rem] font-semibold text-purple-700";
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normaliseItemizedChanges(changes) {
  if (!Array.isArray(changes))
    return [];
  const map = /* @__PURE__ */ new Map();
  changes.forEach((change) => {
    if (!change || typeof change !== "object")
      return;
    const itemText = typeof change.item === "string" ? change.item.trim() : "";
    const changeType = typeof change.changeType === "string" ? change.changeType.trim().toLowerCase() : "";
    if (!itemText || !changeType)
      return;
    const key = `${changeType}::${itemText.toLowerCase()}`;
    const entry = map.get(key) || { item: itemText, changeType, reasons: [] };
    const reasonList = normaliseActionList(
      Array.isArray(change.reasons) ? change.reasons : typeof change.reason === "string" ? [change.reason] : []
    );
    reasonList.forEach((reason) => {
      if (!reason)
        return;
      const lower = reason.toLowerCase();
      if (!entry.reasons.some((existing) => existing.toLowerCase() === lower)) {
        entry.reasons.push(reason);
      }
    });
    map.set(key, entry);
  });
  const changeTypeOrder = { added: 0, replaced: 1, removed: 2 };
  return Array.from(map.values()).sort((a, b) => {
    const orderA = changeTypeOrder[a.changeType] ?? 99;
    const orderB = changeTypeOrder[b.changeType] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.item.localeCompare(b.item, void 0, { sensitivity: "base" });
  });
}
function ChangeComparisonView({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  summarySegments = [],
  addedItems = [],
  removedItems = [],
  itemizedChanges = [],
  categoryChangelog = [],
  variant = "compact",
  className = ""
}) {
  const availableSplit = Boolean(before && after);
  const [view, setView] = reactExports.useState(availableSplit ? "split" : "stack");
  const highlightData = reactExports.useMemo(() => {
    const addedList = normaliseActionList(addedItems);
    const removedList = normaliseActionList(removedItems);
    const addedSet = new Set(addedList.map((item) => item.toLowerCase()));
    const removedSet = new Set(removedList.map((item) => item.toLowerCase()));
    const patternSources = [...addedSet, ...removedSet].filter(Boolean).sort((a, b) => b.length - a.length).map((item) => escapeRegExp(item));
    const regex = patternSources.length ? new RegExp(`(${patternSources.join("|")})`, "gi") : null;
    return { addedSet, removedSet, regex };
  }, [addedItems, removedItems]);
  const hasCategoryChangelog = Array.isArray(categoryChangelog) && categoryChangelog.length > 0;
  const renderHighlighted = (text) => {
    if (!text)
      return null;
    if (!highlightData.regex)
      return text;
    const parts = text.split(highlightData.regex);
    return parts.map((part, index2) => {
      if (!part) {
        return /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, {}, `empty-${index2}`);
      }
      const lower = part.toLowerCase();
      if (highlightData.addedSet.has(lower)) {
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "mark",
          {
            className: "rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800",
            children: part
          },
          `added-${index2}`
        );
      }
      if (highlightData.removedSet.has(lower)) {
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "mark",
          {
            className: "rounded-md bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-800",
            children: part
          },
          `removed-${index2}`
        );
      }
      return /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, { children: part }, `text-${index2}`);
    });
  };
  const hasHighlights = reactExports.useMemo(() => {
    const segmentCount = Array.isArray(summarySegments) ? summarySegments.length : 0;
    return segmentCount > 0 || Array.isArray(addedItems) && addedItems.length > 0 || Array.isArray(removedItems) && removedItems.length > 0;
  }, [summarySegments, addedItems, removedItems]);
  const normalizedItemizedChanges = reactExports.useMemo(
    () => normaliseItemizedChanges(itemizedChanges),
    [itemizedChanges]
  );
  const hasItemizedChanges = normalizedItemizedChanges.length > 0;
  const containerClass = `space-y-4 ${className}`.trim();
  const baseContentClass = variant === "modal" ? "max-h-72 md:max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed" : "whitespace-pre-wrap leading-relaxed";
  const beforeWrapperClass = variant === "modal" ? "rounded-2xl border border-purple-200 bg-purple-50/70 p-4" : "rounded-xl border border-purple-100 bg-purple-50/70 p-3";
  const afterWrapperClass = variant === "modal" ? "rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4" : "rounded-xl border border-indigo-100 bg-indigo-50/60 p-3";
  const summaryList = Array.isArray(summarySegments) ? summarySegments : [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: containerClass, children: [
    availableSplit && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "inline-flex rounded-full border border-purple-200 bg-white/70 p-1 text-xs font-semibold text-purple-600", children: viewOptions.map((option) => {
      if (option.key === "split" && !availableSplit) {
        return null;
      }
      const active = view === option.key;
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setView(option.key),
          className: `px-3 py-1 rounded-full transition ${active ? "bg-purple-600 text-white shadow" : "text-purple-600 hover:bg-purple-100"}`,
          children: option.label
        },
        option.key
      );
    }) }),
    view === "split" && availableSplit ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2 text-sm text-purple-800", children: [
      before && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: beforeWrapperClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: beforeLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-2 ${baseContentClass}`, children: renderHighlighted(before) })
      ] }),
      after && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: afterWrapperClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-indigo-500", children: afterLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-2 ${baseContentClass}`, children: renderHighlighted(after) })
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 text-sm text-purple-800", children: [
      before && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: beforeWrapperClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: beforeLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-2 ${baseContentClass}`, children: renderHighlighted(before) })
      ] }),
      after && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: afterWrapperClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-indigo-500", children: afterLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-2 ${baseContentClass}`, children: renderHighlighted(after) })
      ] })
    ] }),
    hasCategoryChangelog && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 rounded-2xl border border-blue-100 bg-white/75 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-blue-500", children: "ATS Change Summary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-blue-700/80", children: "See why each core category shifted and which items were touched." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-3", children: categoryChangelog.map((category) => {
        if (!category)
          return null;
        const added = Array.isArray(category.added) ? category.added : [];
        const removed = Array.isArray(category.removed) ? category.removed : [];
        const reasons = Array.isArray(category.reasons) ? category.reasons : [];
        const hasChips = added.length > 0 || removed.length > 0;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "li",
          {
            className: "rounded-xl border border-blue-200 bg-white/85 p-3 text-sm text-slate-700",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: category.label || "Category" }),
                typeof category.description === "string" && category.description.trim() && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-blue-500/80", children: category.description }),
                reasons.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc space-y-1 pl-5 text-xs text-slate-600", children: reasons.map((reason, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: reason }, `${category.key || category.label}-reason-${index2}`)) })
              ] }),
              hasChips && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [
                added.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "span",
                  {
                    className: "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "＋" }),
                      item
                    ]
                  },
                  `category-added-${category.key || category.label}-${item}`
                )),
                removed.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "span",
                  {
                    className: "inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-xs font-semibold text-rose-700",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "–" }),
                      item
                    ]
                  },
                  `category-removed-${category.key || category.label}-${item}`
                ))
              ] })
            ]
          },
          category.key || category.label
        );
      }) })
    ] }),
    hasItemizedChanges && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 rounded-2xl border border-indigo-100 bg-white/75 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-indigo-500", children: "Itemised change log" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-semibold text-indigo-600", children: [
          normalizedItemizedChanges.length,
          " item",
          normalizedItemizedChanges.length === 1 ? "" : "s"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-3", children: normalizedItemizedChanges.map((change) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "li",
        {
          className: "rounded-xl border border-slate-200 bg-white/85 p-3 text-sm text-slate-700",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-800", children: change.item }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${itemizedChangeTypeStyles[change.changeType] || "bg-slate-100 text-slate-600 border border-slate-200"}`,
                  children: itemizedChangeTypeLabels[change.changeType] || "Updated"
                }
              )
            ] }),
            change.reasons.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1 text-xs text-slate-600 list-disc pl-5", children: change.reasons.map((reason, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: reason }, `${change.changeType}-${change.item}-reason-${index2}`)) })
          ]
        },
        `${change.changeType}-${change.item}`
      )) })
    ] }),
    hasHighlights && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3 rounded-2xl border border-purple-100 bg-white/70 p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      Array.isArray(addedItems) && addedItems.length > 0 || Array.isArray(removedItems) && removedItems.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: "Key highlights" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          normaliseActionList(addedItems).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "＋" }),
                item
              ]
            },
            `added-chip-${item}`
          )),
          normaliseActionList(removedItems).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: "inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-xs font-semibold text-rose-700",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "–" }),
                item
              ]
            },
            `removed-chip-${item}`
          ))
        ] })
      ] }) : null,
      summaryList.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: "Section breakdown" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: summaryList.map((segment, index2) => {
          if (!segment)
            return null;
          const label = (segment.section || `Section ${index2 + 1}`).trim();
          const reasonLines = Array.isArray(segment.reason) ? segment.reason.filter(Boolean) : [];
          const isSkillSegment = /skill|cert/i.test(label);
          const containerTone = isSkillSegment ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-slate-50/70";
          const actionableSummary = buildSegmentAdvice(label, segment);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: `rounded-2xl border ${containerTone} p-3 text-sm text-slate-700`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-800", children: label }),
                  reasonLines.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-slate-500", children: reasonLines.join(" ") })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [
                  normaliseActionList(segment.added).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "span",
                    {
                      className: "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-emerald-700",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "＋" }),
                        item
                      ]
                    },
                    `segment-added-${label}-${item}`
                  )),
                  normaliseActionList(segment.removed).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "span",
                    {
                      className: "inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-rose-700",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "–" }),
                        item
                      ]
                    },
                    `segment-removed-${label}-${item}`
                  ))
                ] }),
                actionableSummary && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 text-xs font-semibold text-slate-600", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: summaryActionBadgeClass, children: "Action" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2 align-middle", children: actionableSummary })
                ] })
              ]
            },
            `${label}-${index2}`
          );
        }) })
      ] })
    ] }) })
  ] });
}
const accentThemes = {
  indigo: {
    border: "border-indigo-200/70",
    stage: "text-indigo-500",
    title: "text-indigo-900",
    description: "text-indigo-700/80"
  },
  purple: {
    border: "border-purple-200/70",
    stage: "text-purple-500",
    title: "text-purple-900",
    description: "text-purple-700/80"
  },
  slate: {
    border: "border-slate-200/70",
    stage: "text-slate-500",
    title: "text-slate-900",
    description: "text-slate-700/80"
  }
};
function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}
function DashboardStage({
  stageLabel,
  title,
  description,
  actions,
  children,
  accent = "purple",
  className = "",
  contentClassName = "space-y-6"
}) {
  const theme = accentThemes[accent] || accentThemes.purple;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: joinClasses(
        "space-y-5 rounded-3xl border bg-white/90 p-6 shadow-xl backdrop-blur",
        theme.border,
        className
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex flex-col gap-3 md:flex-row md:items-center md:justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            stageLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: joinClasses("caps-label text-xs font-semibold", theme.stage), children: stageLabel }),
            title && /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: joinClasses("text-2xl font-bold", theme.title), children: title }),
            description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: joinClasses("text-sm", theme.description), children: description })
          ] }),
          actions && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex shrink-0 flex-col gap-2 md:items-end", children: actions })
        ] }),
        contentClassName === null ? children : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: contentClassName, children })
      ]
    }
  );
}
const SECTION_KEYWORDS = [
  {
    label: "Overview",
    patterns: [
      /^overview$/i,
      /^about (the )?role/i,
      /^role overview/i,
      /^about us/i,
      /^mission$/i
    ]
  },
  {
    label: "Responsibilities",
    patterns: [
      /responsibil/i,
      /what (you('ll| will) do|we expect)/i,
      /day[-\s]*to[-\s]*day/i,
      /duties/i,
      /in this role/i
    ]
  },
  {
    label: "Requirements",
    patterns: [
      /requirement/i,
      /qualification/i,
      /what you bring/i,
      /skills you/i,
      /you(('|\s)ll) need/i,
      /experience/i
    ]
  },
  {
    label: "Preferred Qualifications",
    patterns: [
      /preferred/i,
      /nice to have/i,
      /bonus/i,
      /plus$/i
    ]
  },
  {
    label: "Benefits",
    patterns: [
      /benefit/i,
      /perks/i,
      /what we offer/i,
      /compensation/i,
      /why you'll love/i
    ]
  },
  {
    label: "Company",
    patterns: [
      /about (the )?company/i,
      /who we are/i,
      /our team/i,
      /culture/i
    ]
  }
];
const STOP_WORDS = /* @__PURE__ */ new Set([
  "about",
  "above",
  "after",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "being",
  "both",
  "but",
  "by",
  "can",
  "company",
  "candidate",
  "day",
  "do",
  "each",
  "ensure",
  "every",
  "for",
  "from",
  "have",
  "help",
  "including",
  "into",
  "is",
  "it",
  "its",
  "join",
  "make",
  "may",
  "more",
  "must",
  "new",
  "of",
  "on",
  "our",
  "role",
  "skills",
  "such",
  "team",
  "the",
  "their",
  "this",
  "to",
  "we",
  "what",
  "will",
  "with",
  "work",
  "you",
  "your"
]);
const META_PATTERNS = [
  { label: "Company", regex: /^company\s*[:\-]\s*(.+)$/i },
  { label: "Location", regex: /^location\s*[:\-]\s*(.+)$/i },
  { label: "Employment Type", regex: /^(employment|contract)\s*type\s*[:\-]\s*(.+)$/i },
  { label: "Salary", regex: /^(salary|compensation|pay range)\s*[:\-]\s*(.+)$/i },
  { label: "Experience", regex: /^(experience|years of experience)\s*[:\-]\s*(.+)$/i }
];
function normalizeLine(line = "") {
  return line.replace(/\s+/g, " ").trim();
}
function isBulletLine(line = "") {
  return /^(?:[\u2022\u2023\u25CF\u25CB\u25A0\u25AA\-\*\+\•\▪\◦\‣]\s+|\d+\.\s+)/.test(line);
}
function detectSectionHeading(line = "") {
  if (!line)
    return null;
  if (isBulletLine(line))
    return null;
  const trimmed = line.replace(/[\s:;\-–—]+$/g, "").trim();
  if (!trimmed)
    return null;
  const lower = trimmed.toLowerCase();
  const keywordMatch = SECTION_KEYWORDS.find(
    (entry) => entry.patterns.some((pattern) => pattern.test(lower))
  );
  if (keywordMatch) {
    return keywordMatch.label;
  }
  const wordCount = trimmed.split(/\s+/).length;
  const looksLikeHeading = trimmed === trimmed.toUpperCase() && wordCount <= 10 || line.endsWith(":") && wordCount <= 12;
  if (looksLikeHeading) {
    return toTitleCase(trimmed);
  }
  return null;
}
function toTitleCase(value = "") {
  if (!value)
    return "";
  const lower = value.toLowerCase();
  return lower.replace(
    /(^|[\s-/])([a-z])/g,
    (match, separator, char) => `${separator}${char.toUpperCase()}`
  );
}
function extractKeywords(text = "") {
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9+#\.\-/]{1,}/g);
  if (!tokens)
    return [];
  const counts = /* @__PURE__ */ new Map();
  for (const token of tokens) {
    if (token.length < 4)
      continue;
    if (STOP_WORDS.has(token))
      continue;
    const cleaned = token.replace(/^(?:and|the)\-/, "");
    const current = counts.get(cleaned) || 0;
    counts.set(cleaned, current + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => {
    if (b[1] === a[1]) {
      return a[0].localeCompare(b[0]);
    }
    return b[1] - a[1];
  }).slice(0, 12).map(([token]) => token.replace(/\+\+/g, "++"));
}
function isLikelyTitle(line = "") {
  if (!line)
    return false;
  if (isBulletLine(line))
    return false;
  if (/^(company|location|employment type|job description|about|overview|responsibil)/i.test(line)) {
    return false;
  }
  const wordCount = line.split(/\s+/).length;
  return wordCount > 0 && wordCount <= 16;
}
function extractMeta(lines = []) {
  const meta = [];
  for (const line of lines) {
    for (const pattern of META_PATTERNS) {
      const match = line.match(pattern.regex);
      if (match) {
        const value = normalizeLine(match[1] || match[2] || "");
        if (value && value.length <= 120 && !meta.some((item) => item.label === pattern.label)) {
          meta.push({ label: pattern.label, value });
        }
      }
    }
  }
  return meta;
}
function parseJobDescriptionText(rawText = "") {
  if (typeof rawText !== "string")
    return null;
  const text = rawText.replace(/\r\n?/g, "\n");
  const lines = text.split("\n").map(normalizeLine);
  const nonEmpty = lines.filter(Boolean);
  if (!nonEmpty.length)
    return null;
  let title = "";
  const contentLines = [];
  for (const line of nonEmpty) {
    if (!title && isLikelyTitle(line)) {
      title = toTitleCase(line);
      continue;
    }
    contentLines.push(line);
  }
  if (!title && contentLines.length) {
    title = toTitleCase(contentLines.shift());
  }
  if (!title) {
    title = "Job Description";
  }
  const meta = extractMeta(contentLines.slice(0, 12));
  const sections = [];
  let currentSection = {
    heading: "Overview",
    bullets: [],
    paragraphs: []
  };
  const pushSection = () => {
    if (currentSection.bullets.length || currentSection.paragraphs.length) {
      sections.push(currentSection);
    }
  };
  for (const line of contentLines) {
    const heading = detectSectionHeading(line);
    if (heading) {
      if (currentSection.heading !== heading && (currentSection.bullets.length || currentSection.paragraphs.length)) {
        pushSection();
        currentSection = {
          heading,
          bullets: [],
          paragraphs: []
        };
      } else {
        currentSection = {
          heading,
          bullets: [],
          paragraphs: []
        };
      }
      continue;
    }
    const bulletMatch = line.match(/^(?:[\u2022\u2023\u25CF\u25CB\u25A0\u25AA\-\*\+\•\▪\◦\‣]\s+|\d+\.\s+)(.+)$/);
    if (bulletMatch) {
      const bulletText = normalizeLine(bulletMatch[1]);
      if (bulletText)
        currentSection.bullets.push(bulletText);
      continue;
    }
    if (line) {
      currentSection.paragraphs.push(line);
    }
  }
  pushSection();
  if (!sections.length && (currentSection.bullets.length || currentSection.paragraphs.length)) {
    sections.push(currentSection);
  }
  const combinedText = [title, ...contentLines].join(" ");
  const keywords = extractKeywords(combinedText);
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;
  return {
    title,
    sections,
    keywords,
    wordCount,
    meta
  };
}
function JobDescriptionPreview({ text }) {
  const parsed = reactExports.useMemo(() => parseJobDescriptionText(text), [text]);
  if (!parsed)
    return null;
  const { title, sections, keywords, wordCount, meta } = parsed;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "space-y-4 rounded-2xl border border-purple-200 bg-white/70 p-4 text-left shadow-sm",
      "data-testid": "job-description-preview",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex flex-col gap-3 md:flex-row md:items-start md:justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-purple-900", children: "Job Description Preview" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-600/80", children: "Confirm the parsed JD content below before running the ATS score so we analyse the exact role you pasted." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "caps-label flex items-center gap-3 text-xs font-semibold text-purple-500", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { "data-testid": "jd-word-count", children: [
              wordCount,
              " words"
            ] }),
            sections.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { "data-testid": "jd-section-count", children: [
              sections.length,
              " sections"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 rounded-xl bg-gradient-to-r from-purple-50 to-white p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-bold text-purple-900", "data-testid": "jd-title", children: title }),
          meta.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "grid gap-2 text-sm text-purple-700 sm:grid-cols-2", "data-testid": "jd-meta", children: meta.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: item.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "font-medium text-purple-800", children: item.value })
          ] }, `${item.label}-${item.value}`)) }),
          keywords.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", "data-testid": "jd-keywords", children: keywords.map((keyword) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700",
              children: keyword
            },
            keyword
          )) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: sections.map((section) => /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "space-y-2 rounded-xl border border-purple-100 bg-white/90 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "caps-label text-sm font-semibold text-purple-500", "data-testid": "jd-section-title", children: section.heading }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 text-sm leading-relaxed text-purple-900", "data-testid": "jd-section-content", children: [
            section.paragraphs.map((paragraph, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: paragraph }, `paragraph-${index2}`)),
            section.bullets.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc space-y-1 pl-5 marker:text-purple-400", children: section.bullets.map((bullet, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: bullet }, `bullet-${index2}`)) })
          ] })
        ] }, section.heading)) })
      ]
    }
  );
}
function formatItems(items = [], limit = 6) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const visible = list.slice(0, limit);
  const remainder = list.length - visible.length;
  return { visible, remainder };
}
function normalizeContextText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "";
  }
  return "";
}
function summariseContextSnippet(text, { wordLimit = 48 } = {}) {
  const normalized = normalizeContextText(text).replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  const words = normalized.split(" ");
  if (words.length <= wordLimit) {
    return normalized;
  }
  return `${words.slice(0, wordLimit).join(" ")}…`;
}
function areEqualIgnoreCase(a, b) {
  const left = normalizeContextText(a).toLowerCase();
  const right = normalizeContextText(b).toLowerCase();
  if (!left || !right) {
    return false;
  }
  return left === right;
}
const chipToneByType = {
  added: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
  removed: "border-rose-200 bg-rose-50/80 text-rose-700",
  changed: "border-indigo-200 bg-indigo-50/80 text-indigo-700"
};
const iconByType = {
  added: "＋",
  removed: "–",
  changed: "→"
};
function HighlightItems({ highlight }) {
  const { visible, remainder } = formatItems(highlight.items);
  if (visible.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: "No updates captured yet." });
  }
  if (highlight.type === "reasons") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc space-y-1 pl-4 text-xs text-slate-600", children: [
      visible.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: item }, `${highlight.key}-reason-${index2}`)),
      remainder > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "font-semibold text-slate-500", children: [
        "+",
        remainder,
        " more"
      ] })
    ] });
  }
  const chipClass = chipToneByType[highlight.type] || "border-slate-200 bg-slate-50/80 text-slate-700";
  const icon = iconByType[highlight.type] || "•";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
    visible.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "span",
      {
        className: `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${chipClass}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: icon }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: item })
        ]
      },
      `${highlight.key}-${item}`
    )),
    remainder > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600", children: [
      "+",
      remainder,
      " more"
    ] })
  ] });
}
function ChangeLogSummaryPanel({ summary, context = {} }) {
  if (!summary) {
    return null;
  }
  const {
    highlights = [],
    categories: categories2 = [],
    interviewPrepAdvice = "",
    totals = {},
    sections = []
  } = summary;
  const hasHighlights = Array.isArray(highlights) && highlights.length > 0;
  const hasCategories = Array.isArray(categories2) && categories2.length > 0;
  const adviceText = typeof interviewPrepAdvice === "string" ? interviewPrepAdvice.trim() : "";
  const sectionEntries = Array.isArray(sections) ? sections.filter(Boolean) : [];
  const statDefinitions = [
    {
      key: "entries",
      label: "Accepted improvements",
      value: Number.isFinite(totals.entries) ? totals.entries : null
    },
    {
      key: "categories",
      label: "Categories impacted",
      value: Number.isFinite(totals.categories) ? totals.categories : null
    },
    {
      key: "addedItems",
      label: "Items added",
      value: Number.isFinite(totals.addedItems) ? totals.addedItems : null
    },
    {
      key: "removedItems",
      label: "Items removed",
      value: Number.isFinite(totals.removedItems) ? totals.removedItems : null
    }
  ].filter((stat) => stat.value !== null);
  const hasStats = statDefinitions.length > 0;
  const hasSections = sectionEntries.length > 0;
  const jobTitle = normalizeContextText(context.jobTitle);
  const jobDescriptionSnippet = summariseContextSnippet(
    context.jobDescription,
    { wordLimit: 54 }
  );
  const targetTitle = normalizeContextText(context.targetTitle);
  const originalTitle = normalizeContextText(context.originalTitle);
  const targetSummary = normalizeContextText(context.targetSummary);
  const showOriginalContext = Boolean(jobTitle || jobDescriptionSnippet);
  const showTargetContext = Boolean(targetTitle || targetSummary || originalTitle);
  const hasContext = showOriginalContext || showTargetContext;
  if (!hasHighlights && !hasCategories && !hasContext && !adviceText) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm",
      "aria-labelledby": "change-log-summary-title",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-slate-500", children: "Change Log Summary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "change-log-summary-title", className: "text-lg font-semibold text-slate-900", children: "Highlights from accepted enhancements" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-600", children: "Quickly review the standout updates applied to your resume after accepting improvements." })
        ] }),
        hasStats && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-3 md:grid-cols-4", children: statDefinitions.map((stat) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "rounded-2xl border border-slate-200 bg-white/90 p-4 text-center shadow-inner",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label-tight text-xs font-semibold text-slate-500", children: stat.label }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-2xl font-semibold text-slate-900", children: stat.value })
            ]
          },
          stat.key
        )) }),
        hasContext && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-3 lg:grid-cols-2", children: [
          (showOriginalContext || !showTargetContext) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label-tight text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Original JD" }),
            jobTitle ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: jobTitle }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-700", children: "Original job description not available yet" }),
            jobDescriptionSnippet ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs leading-relaxed text-slate-600", children: jobDescriptionSnippet }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: "Paste the full JD so we can keep its requirements in view." })
          ] }),
          (showTargetContext || !showOriginalContext) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-left", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label-tight text-xs font-semibold uppercase tracking-wide text-indigo-500", children: "What your CV now targets" }),
            targetTitle ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-indigo-900", children: targetTitle }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-indigo-700", children: "Target designation pending" }),
            targetSummary ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs leading-relaxed text-indigo-800/90", children: targetSummary }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs leading-relaxed text-indigo-700/80", children: targetTitle ? "Updates refocus your positioning on the JD priorities." : "Accept improvements to capture the updated positioning." }),
            originalTitle && targetTitle && !areEqualIgnoreCase(originalTitle, targetTitle) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs font-semibold text-indigo-600/80", children: [
              "Originally titled: ",
              originalTitle
            ] }),
            !targetTitle && originalTitle && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs font-semibold text-indigo-600/80", children: [
              "Currently showing: ",
              originalTitle
            ] })
          ] })
        ] }),
        adviceText && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-sm text-emerald-900", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-emerald-700", children: "Interview prep spotlight" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 leading-relaxed", children: adviceText })
        ] }),
        hasSections && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-slate-500", children: "Where updates landed" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: sectionEntries.map((section) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: "inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-700",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: section.label || section.key || "Section" }),
                Number.isFinite(section.count) && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full bg-white/80 px-2 py-0.5 text-[0.65rem] font-semibold text-indigo-600", children: [
                  "×",
                  section.count
                ] })
              ]
            },
            section.key || section.label
          )) })
        ] }),
        hasHighlights && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: highlights.map((highlight) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "li",
          {
            className: "rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-inner space-y-3",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: highlight.label }),
                typeof highlight.count === "number" && highlight.count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "caps-label-tight rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600", children: highlight.count })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(HighlightItems, { highlight })
            ]
          },
          highlight.key
        )) }),
        hasCategories && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-slate-500", children: "Category rationale" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "grid grid-cols-1 gap-3 lg:grid-cols-2", children: categories2.map((category) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "li",
            {
              className: "rounded-2xl border border-slate-200 bg-white/90 p-4 space-y-2",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: category.label }),
                  category.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-600", children: category.description })
                ] }),
                Array.isArray(category.added) && category.added.length > 0 || Array.isArray(category.removed) && category.removed.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
                  Array.isArray(category.added) && category.added.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "span",
                    {
                      className: "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "＋" }),
                        item
                      ]
                    },
                    `${category.key}-added-${item}`
                  )),
                  Array.isArray(category.removed) && category.removed.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "span",
                    {
                      className: "inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-xs font-semibold text-rose-700",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "–" }),
                        item
                      ]
                    },
                    `${category.key}-removed-${item}`
                  ))
                ] }) : null,
                Array.isArray(category.reasons) && category.reasons.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc space-y-1 pl-4 text-xs text-slate-600", children: [
                  category.reasons.slice(0, 4).map((reason, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: reason }, `${category.key}-reason-${index2}`)),
                  category.reasons.length > 4 && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "font-semibold text-slate-500", children: [
                    "+",
                    category.reasons.length - 4,
                    " more"
                  ] })
                ] })
              ]
            },
            category.key
          )) })
        ] })
      ]
    }
  );
}
const cx = (...classes) => classes.filter(Boolean).join(" ");
function CoverLetterEditorModal({
  isOpen = false,
  label = "Cover letter",
  draftText = "",
  originalText = "",
  hasChanges = false,
  wordCount = 0,
  onClose = () => {
  },
  onChange = () => {
  },
  onReset = () => {
  },
  onCopy = () => {
  },
  onDownload = () => {
  },
  isDownloading = false,
  downloadError = "",
  clipboardStatus = "",
  coverTemplateId = "",
  coverTemplateName = ""
}) {
  if (!isOpen) {
    return null;
  }
  const title = label || "Cover letter";
  const originalWordCount = originalText.trim() ? originalText.trim().split(/\s+/).filter(Boolean).length : 0;
  const changeBadgeClass = hasChanges ? "inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700" : "inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600";
  const coverStyle = getCoverTemplateStyle(coverTemplateId) || DEFAULT_COVER_TEMPLATE_STYLE;
  const headerClass = cx(
    "flex items-start justify-between gap-4 border-b px-6 py-4",
    coverStyle.header || DEFAULT_COVER_TEMPLATE_STYLE.header,
    "border-white/20"
  );
  const footerClass = cx(
    "border-t px-6 py-4",
    coverStyle.footer || DEFAULT_COVER_TEMPLATE_STYLE.footer
  );
  const isFooterDark = /bg-slate-9/i.test(coverStyle.footer || "");
  const footerErrorTextClass = isFooterDark ? "text-sm font-medium text-rose-200" : "text-sm font-medium text-rose-600";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": `Edit ${title}`,
      onClick: onClose,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "w-full max-w-4xl overflow-hidden rounded-3xl border border-indigo-200/70 bg-white shadow-2xl",
          onClick: (event) => event.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: headerClass, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1 text-current", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-current", children: title }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm opacity-80", children: "Refine the draft text before downloading your personalised PDF." }),
                coverTemplateName ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs font-semibold uppercase tracking-wide opacity-80", children: [
                  "Styled with ",
                  coverTemplateName
                ] }) : null
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: onClose,
                  className: "text-sm font-semibold text-current transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/40",
                  children: "Close"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-6 px-6 py-6 text-indigo-900", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold uppercase tracking-wide text-indigo-700", children: "Original cover letter" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-medium text-indigo-500", children: [
                    originalWordCount,
                    " word",
                    originalWordCount === 1 ? "" : "s"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "textarea",
                  {
                    id: "cover-letter-original",
                    value: originalText,
                    readOnly: true,
                    rows: 14,
                    className: "h-full min-h-[14rem] w-full rounded-2xl border border-indigo-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed shadow-inner text-indigo-700",
                    "aria-describedby": "cover-letter-original-help"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "p",
                  {
                    id: "cover-letter-original-help",
                    className: "text-xs text-indigo-500",
                    children: originalText ? "Reference the original draft while you personalise the enhanced version." : "Original draft text is not available yet. Generate a cover letter to populate this view."
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold uppercase tracking-wide text-indigo-700", children: "Enhanced cover letter" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: changeBadgeClass, children: hasChanges ? "Edited" : "Original draft" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-medium text-indigo-500", children: [
                    wordCount,
                    " word",
                    wordCount === 1 ? "" : "s"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "textarea",
                  {
                    id: "cover-letter-enhanced",
                    value: draftText,
                    onChange: (event) => onChange(event.target.value),
                    rows: 14,
                    className: "h-full min-h-[14rem] w-full rounded-2xl border border-indigo-200 bg-white/90 px-4 py-3 text-sm leading-relaxed shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-400",
                    placeholder: "Introduce yourself, highlight the top accomplishments that match the JD, and close with a confident call to action."
                  }
                )
              ] })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("footer", { className: footerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: onReset,
                    className: "rounded-xl border border-indigo-200 px-4 py-2 text-indigo-700 transition hover:bg-indigo-50",
                    children: "Reset to original"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: onCopy,
                    className: "rounded-xl border border-indigo-200 px-4 py-2 text-indigo-700 transition hover:bg-indigo-50",
                    children: "Copy to clipboard"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: onDownload,
                    disabled: isDownloading,
                    className: `rounded-xl px-4 py-2 font-semibold text-white shadow ${isDownloading ? "bg-indigo-300 cursor-wait" : "bg-indigo-600 hover:bg-indigo-700"}`,
                    children: isDownloading ? "Preparing PDF…" : "Download updated PDF"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                downloadError ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: footerErrorTextClass, children: downloadError }) : null,
                clipboardStatus ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-current opacity-80", children: clipboardStatus }) : null
              ] })
            ] }) })
          ]
        }
      )
    }
  );
}
const summaryIcon = "" + new URL("icon-summary-0c0b7f1d.svg", import.meta.url).href;
const skillsIcon = "" + new URL("icon-skills-db253e72.svg", import.meta.url).href;
const experienceIcon = "" + new URL("icon-experience-41ac604b.svg", import.meta.url).href;
const designationIcon = "" + new URL("icon-designation-0b11da5e.svg", import.meta.url).href;
const certificationsIcon = "" + new URL("icon-certifications-69654b69.svg", import.meta.url).href;
const projectsIcon = "" + new URL("icon-projects-0997c76f.svg", import.meta.url).href;
const highlightsIcon = "" + new URL("icon-highlights-468cb4b9.svg", import.meta.url).href;
const enhanceIcon = "" + new URL("icon-enhance-08c73f02.svg", import.meta.url).href;
const CATEGORY_KEYS = [
  "skills",
  "experience",
  "tasks",
  "designation",
  "highlights",
  "keywords",
  "certificates"
];
function createAccumulator() {
  return CATEGORY_KEYS.reduce((acc, key) => {
    acc[key] = { added: /* @__PURE__ */ new Set(), missing: /* @__PURE__ */ new Set() };
    return acc;
  }, {});
}
function normalizeText(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}
function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}
function normalizeCertificateList(value) {
  if (!value)
    return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => {
    if (!item)
      return "";
    if (typeof item === "string") {
      return item.trim();
    }
    if (typeof item === "object") {
      const name = normalizeText(item.name || item.title);
      const provider = normalizeText(item.provider || item.issuer || item.organization);
      const combined = [name, provider].filter(Boolean).join(" — ");
      return combined || name || provider;
    }
    return "";
  }).filter(Boolean);
}
function finalise(accumulator) {
  return CATEGORY_KEYS.reduce((result, key) => {
    const added = Array.from(accumulator[key].added).filter(Boolean);
    const missing = Array.from(accumulator[key].missing).filter(Boolean);
    result[key] = { added, missing };
    return result;
  }, {});
}
function pushItems$1(targetSet, items) {
  items.forEach((item) => {
    const text = normalizeText(item);
    if (text) {
      targetSet.add(text);
    }
  });
}
function deriveDeltaSummary({
  match,
  changeLog,
  certificateInsights,
  manualCertificates,
  jobSkills,
  resumeSkills
}) {
  const accumulator = createAccumulator();
  const addToCategory = (key, items) => {
    if (!CATEGORY_KEYS.includes(key))
      return;
    pushItems$1(accumulator[key].added, normalizeStringList(items));
  };
  const markMissingInCategory = (key, items) => {
    if (!CATEGORY_KEYS.includes(key))
      return;
    pushItems$1(accumulator[key].missing, normalizeStringList(items));
  };
  const addCertificates = (items) => {
    normalizeCertificateList(items).forEach((item) => {
      const text = normalizeText(item);
      if (text) {
        accumulator.certificates.added.add(text);
      }
    });
  };
  const markCertificatesMissing = (items) => {
    normalizeCertificateList(items).forEach((item) => {
      const text = normalizeText(item);
      if (text) {
        accumulator.certificates.missing.add(text);
      }
    });
  };
  const addedSkills = normalizeStringList(match == null ? void 0 : match.addedSkills);
  const missingSkills = normalizeStringList(match == null ? void 0 : match.missingSkills);
  addToCategory("skills", addedSkills);
  addToCategory("keywords", addedSkills);
  markMissingInCategory("skills", missingSkills);
  markMissingInCategory("keywords", missingSkills);
  const originalTitle = normalizeText(match == null ? void 0 : match.originalTitle);
  const modifiedTitle = normalizeText(match == null ? void 0 : match.modifiedTitle);
  if (modifiedTitle) {
    accumulator.designation.added.add(modifiedTitle);
  }
  if (originalTitle && modifiedTitle && originalTitle.toLowerCase() !== modifiedTitle.toLowerCase()) {
    accumulator.designation.missing.add(originalTitle);
  }
  const normalisedJobSkills = normalizeStringList(jobSkills);
  const normalisedResumeSkills = normalizeStringList(resumeSkills);
  const resumeSkillSet = new Set(normalisedResumeSkills.map((skill) => skill.toLowerCase()));
  const jobSkillSet = new Set(normalisedJobSkills.map((skill) => skill.toLowerCase()));
  const jobOnlySkills = normalisedJobSkills.filter((skill) => !resumeSkillSet.has(skill.toLowerCase()));
  markMissingInCategory("skills", jobOnlySkills);
  markMissingInCategory("keywords", jobOnlySkills);
  const resumeOnlySkills = normalisedResumeSkills.filter((skill) => !jobSkillSet.has(skill.toLowerCase()));
  addToCategory("skills", resumeOnlySkills);
  addCertificates(certificateInsights == null ? void 0 : certificateInsights.known);
  addCertificates(manualCertificates);
  markCertificatesMissing(certificateInsights == null ? void 0 : certificateInsights.suggestions);
  if (certificateInsights == null ? void 0 : certificateInsights.manualEntryRequired) {
    accumulator.certificates.missing.add("Manual entry required");
  }
  const changeLogEntries = Array.isArray(changeLog) ? changeLog : [];
  changeLogEntries.forEach((entry) => {
    if (entry == null ? void 0 : entry.reverted) {
      return;
    }
    const entryType = normalizeText(entry == null ? void 0 : entry.type);
    const entryAdded = normalizeStringList(entry == null ? void 0 : entry.addedItems);
    const entryRemoved = normalizeStringList(entry == null ? void 0 : entry.removedItems);
    if (entryType === "add-missing-skills") {
      addToCategory("skills", entryAdded);
      addToCategory("keywords", entryAdded);
      markMissingInCategory("skills", entryRemoved);
      markMissingInCategory("keywords", entryRemoved);
    }
    if (entryType === "align-experience" || entryType === "improve-projects") {
      addToCategory("experience", entryAdded);
      markMissingInCategory("experience", entryRemoved);
      addToCategory("tasks", entryAdded);
      markMissingInCategory("tasks", entryRemoved);
    }
    if (entryType === "improve-summary" || entryType === "improve-highlights") {
      addToCategory("highlights", entryAdded);
      markMissingInCategory("highlights", entryRemoved);
    }
    if (entryType === "change-designation") {
      addToCategory("designation", entryAdded);
      markMissingInCategory("designation", entryRemoved);
    }
    const segments = Array.isArray(entry == null ? void 0 : entry.summarySegments) ? entry.summarySegments : [];
    segments.forEach((segment) => {
      const section = normalizeText(segment == null ? void 0 : segment.section);
      const sectionLower = section.toLowerCase();
      const segmentAdded = normalizeStringList(segment == null ? void 0 : segment.added);
      const segmentRemoved = normalizeStringList(segment == null ? void 0 : segment.removed);
      if (sectionLower && /skill|keyword/.test(sectionLower)) {
        addToCategory("skills", segmentAdded);
        addToCategory("keywords", segmentAdded);
        markMissingInCategory("skills", segmentRemoved);
        markMissingInCategory("keywords", segmentRemoved);
      }
      if (sectionLower && /experience|career|project|achievement|impact/.test(sectionLower)) {
        addToCategory("experience", segmentAdded);
        markMissingInCategory("experience", segmentRemoved);
      }
      if (sectionLower && /responsibilit|task|project|experience/.test(sectionLower)) {
        addToCategory("tasks", segmentAdded);
        markMissingInCategory("tasks", segmentRemoved);
      }
      if (sectionLower && /certificate|certification|badge/.test(sectionLower)) {
        addToCategory("certificates", segmentAdded);
        markCertificatesMissing(segmentRemoved);
      }
      if (sectionLower && /highlight|summary|profile|overview/.test(sectionLower)) {
        addToCategory("highlights", segmentAdded);
        markMissingInCategory("highlights", segmentRemoved);
      }
      if (sectionLower && /designation|title|headline|position/.test(sectionLower)) {
        addToCategory("designation", segmentAdded);
        markMissingInCategory("designation", segmentRemoved);
      }
    });
  });
  return finalise(accumulator);
}
const URL_KEYS = ["url", "fileUrl", "typeUrl", "downloadUrl", "href", "link", "signedUrl"];
const EXPIRES_AT_KEYS = [
  "expiresAt",
  "expiryAt",
  "expiry",
  "expires_at",
  "expiry_at",
  "expiresISO",
  "expiryISO",
  "expiresAtIso",
  "expiresAtISO",
  "expiryIso",
  "expiryISO"
];
const EXPIRES_IN_KEYS = [
  "expiresInSeconds",
  "expiresIn",
  "expiryInSeconds",
  "expirySeconds",
  "expires_in_seconds",
  "expires_in",
  "expiry_in_seconds",
  "expiry_in"
];
const EXPIRES_EPOCH_KEYS = [
  "expiresAtEpoch",
  "expiryAtEpoch",
  "expiryEpoch",
  "expiresEpoch",
  "expiresAtTimestamp",
  "expiryTimestamp",
  "expiryEpochSeconds",
  "expiresEpochSeconds",
  "expires_at_epoch",
  "expiry_at_epoch"
];
const EXPIRES_MS_KEYS = [
  "expiresAtMs",
  "expiryAtMs",
  "expiryMs",
  "expiresMs",
  "expires_at_ms",
  "expiry_at_ms"
];
const KNOWN_AUTO_TYPES = /* @__PURE__ */ new Set([
  "original_upload",
  "original",
  "version1",
  "version2",
  "cover_letter1",
  "cover_letter2"
]);
const PRESERVED_STRING_FIELDS = [
  "fileName",
  "title",
  "template",
  "templateId",
  "templateName",
  "coverTemplate",
  "coverTemplateId",
  "coverTemplateName",
  "storageKey",
  "versionId",
  "versionHash"
];
const TEMPLATE_META_STRING_FIELDS = [
  "id",
  "name",
  "variant",
  "category",
  "template",
  "type",
  "description",
  "label"
];
const PRESENTATION_STRING_FIELDS = [
  "label",
  "description",
  "badgeText",
  "badgeStyle",
  "buttonStyle",
  "secondaryButtonStyle",
  "cardAccent",
  "cardBorder",
  "linkLabel",
  "category"
];
const BANNED_STATUS_PATTERNS = [
  /\btest(ing)?\b/i,
  /\bpreview\b/i,
  /\bstale\b/i,
  /\bsandbox\b/i,
  /\bdraft\b/i,
  /\bplaceholder\b/i,
  /\bsample\b/i,
  /\bdummy\b/i,
  /\barchive(d)?\b/i,
  /\bexpired?\b/i
];
const USER_STATUS_VALUES = /* @__PURE__ */ new Set([
  "user",
  "manual",
  "upload",
  "original",
  "candidate",
  "selected",
  "user-selected",
  "user_selected"
]);
const AUTO_STATUS_VALUES = /* @__PURE__ */ new Set([
  "auto",
  "automatic",
  "auto-enhanced",
  "auto_enhanced",
  "auto-generated",
  "auto_generated",
  "autogenerated",
  "generated",
  "enhanced",
  "ai",
  "ai-generated",
  "ai_generated"
]);
function toLowerSafe$1(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function normalizeTagList(value) {
  if (!value)
    return [];
  if (Array.isArray(value)) {
    return value.map(toLowerSafe$1).filter(Boolean);
  }
  if (typeof value === "string") {
    return [toLowerSafe$1(value)].filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value).map((entry) => typeof entry === "string" ? entry : "").map(toLowerSafe$1).filter(Boolean);
  }
  return [];
}
function matchesBannedStatus(value) {
  const normalized = toLowerSafe$1(value);
  if (!normalized)
    return false;
  return BANNED_STATUS_PATTERNS.some((pattern) => pattern.test(normalized));
}
function hasTrustedMetadata(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const presentation = entry.presentation;
  if (presentation && typeof presentation === "object") {
    const presentationStrings = PRESENTATION_STRING_FIELDS.some((key) => {
      const value = presentation[key];
      return typeof value === "string" && value.trim();
    });
    if (presentationStrings || Number.isFinite(presentation.autoPreviewPriority)) {
      return true;
    }
  }
  if (entry.templateMeta && typeof entry.templateMeta === "object") {
    const metaHasValue = TEMPLATE_META_STRING_FIELDS.some((key) => {
      const value = entry.templateMeta[key];
      return typeof value === "string" && value.trim();
    });
    if (metaHasValue) {
      return true;
    }
  }
  const templateStrings = ["templateId", "templateName", "template"];
  if (templateStrings.some((key) => typeof entry[key] === "string" && entry[key].trim())) {
    return true;
  }
  return false;
}
function isMarkedTestOrStale(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  if (entry.__trusted === true || hasTrustedMetadata(entry)) {
    return false;
  }
  if (entry.test === true || entry.isTest === true || entry.testing === true) {
    return true;
  }
  if (entry.preview === true || entry.isPreview === true) {
    return true;
  }
  if (entry.stale === true || entry.isStale === true || entry.archived === true) {
    return true;
  }
  const statusCandidates = [
    entry.status,
    entry.state,
    entry.stage,
    entry.lifecycle,
    entry.lifecycleStatus,
    entry.lifecycleState,
    entry.variant,
    entry.mode,
    entry.phase,
    entry.version
  ];
  for (const candidate of statusCandidates) {
    if (matchesBannedStatus(candidate)) {
      return true;
    }
  }
  if (matchesBannedStatus(entry.label) || matchesBannedStatus(entry.type)) {
    return true;
  }
  const tagValues = [
    ...normalizeTagList(entry.tags),
    ...normalizeTagList(entry.labels),
    ...normalizeTagList(entry.categories),
    ...normalizeTagList(entry.flags)
  ];
  for (const tag of tagValues) {
    if (matchesBannedStatus(tag)) {
      return true;
    }
  }
  return false;
}
function isUserSelectedEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  if (entry.userSelected === true || entry.selected === true || entry.isSelected === true) {
    return true;
  }
  if (entry.fromUser === true || entry.manual === true || entry.isManual === true || entry.fromUpload === true) {
    return true;
  }
  const type = toLowerSafe$1(entry.type);
  if (type === "original_upload" || type === "original") {
    return true;
  }
  const sources = [entry.source, entry.origin, entry.owner, entry.createdBy, entry.generator, entry.mode];
  for (const source of sources) {
    if (USER_STATUS_VALUES.has(toLowerSafe$1(source))) {
      return true;
    }
  }
  const tagValues = [
    ...normalizeTagList(entry.tags),
    ...normalizeTagList(entry.labels),
    ...normalizeTagList(entry.categories),
    ...normalizeTagList(entry.flags)
  ];
  for (const tag of tagValues) {
    if (USER_STATUS_VALUES.has(tag)) {
      return true;
    }
  }
  return false;
}
function isAutoEnhancedEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  if (entry.autoEnhanced === true || entry.auto === true || entry.isAuto === true) {
    return true;
  }
  if (entry.generated === true || entry.isGenerated === true || entry.aiGenerated === true) {
    return true;
  }
  const type = toLowerSafe$1(entry.type);
  if (KNOWN_AUTO_TYPES.has(type) || type.startsWith("version") || type.startsWith("cover_letter") || type.includes("enhanced") || type.endsWith("_resume") || type.endsWith("_cv")) {
    return true;
  }
  const sources = [entry.source, entry.origin, entry.generator, entry.mode];
  for (const source of sources) {
    if (AUTO_STATUS_VALUES.has(toLowerSafe$1(source))) {
      return true;
    }
  }
  const tagValues = [
    ...normalizeTagList(entry.tags),
    ...normalizeTagList(entry.labels),
    ...normalizeTagList(entry.categories),
    ...normalizeTagList(entry.flags)
  ];
  for (const tag of tagValues) {
    if (AUTO_STATUS_VALUES.has(tag)) {
      return true;
    }
    if (tag.includes("auto") || tag.includes("ai") || tag.includes("enhanced")) {
      return true;
    }
  }
  return false;
}
function pickFirstString(source = {}, keys = []) {
  for (const key of keys) {
    if (source && typeof source === "object" && key in source) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return "";
}
function toFiniteNumber(value) {
  if (value == null)
    return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
function normaliseExpiresAt(value) {
  if (!value)
    return void 0;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || void 0;
  }
  return void 0;
}
function resolveEpoch(value) {
  const finite = toFiniteNumber(value);
  if (finite == null)
    return void 0;
  const milliseconds = Math.abs(finite) < 1e12 ? finite * 1e3 : finite;
  return new Date(milliseconds).toISOString();
}
function resolveExpiresAt(entry, options = {}, visited = /* @__PURE__ */ new Set()) {
  if (!entry || typeof entry !== "object") {
    return normaliseExpiresAt(entry);
  }
  if (visited.has(entry)) {
    return void 0;
  }
  visited.add(entry);
  const directIso = pickFirstString(entry, EXPIRES_AT_KEYS);
  if (directIso) {
    const normalized = normaliseExpiresAt(directIso);
    if (normalized) {
      return normalized;
    }
  }
  for (const key of EXPIRES_MS_KEYS) {
    if (key in entry) {
      const normalized = resolveEpoch(entry[key]);
      if (normalized) {
        return normalized;
      }
    }
  }
  for (const key of EXPIRES_EPOCH_KEYS) {
    if (key in entry) {
      const normalized = resolveEpoch(entry[key]);
      if (normalized) {
        return normalized;
      }
    }
  }
  for (const key of EXPIRES_IN_KEYS) {
    if (key in entry) {
      const seconds = toFiniteNumber(entry[key]);
      if (seconds != null) {
        return new Date(Date.now() + seconds * 1e3).toISOString();
      }
    }
  }
  const nestedSources = [
    entry.download,
    entry.asset,
    entry.document,
    entry.file,
    entry.link,
    entry.payload,
    entry.value
  ];
  nestedSources.push(
    ...Array.isArray(entry.urls) ? entry.urls : [],
    ...Array.isArray(entry.links) ? entry.links : []
  );
  if (entry.urls && typeof entry.urls === "object") {
    nestedSources.push(...Object.values(entry.urls));
  }
  if (entry.links && typeof entry.links === "object") {
    nestedSources.push(...Object.values(entry.links));
  }
  for (const nested of nestedSources) {
    if (!nested)
      continue;
    const nestedExpiry = resolveExpiresAt(nested, options, visited);
    if (nestedExpiry) {
      return nestedExpiry;
    }
  }
  if (options.defaultExpiresAt) {
    const normalized = normaliseExpiresAt(options.defaultExpiresAt);
    if (normalized) {
      return normalized;
    }
  }
  if (options.defaultExpiresInSeconds != null) {
    const seconds = toFiniteNumber(options.defaultExpiresInSeconds);
    if (seconds != null) {
      return new Date(Date.now() + seconds * 1e3).toISOString();
    }
  }
  return void 0;
}
function isLikelyUrl(value) {
  if (typeof value !== "string")
    return false;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed);
}
function extractUrl(entry, visited = /* @__PURE__ */ new Set()) {
  if (!entry)
    return "";
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed && isLikelyUrl(trimmed) ? trimmed : "";
  }
  if (typeof entry !== "object") {
    return "";
  }
  if (visited.has(entry)) {
    return "";
  }
  visited.add(entry);
  const direct = pickFirstString(entry, URL_KEYS);
  if (direct && isLikelyUrl(direct)) {
    return direct;
  }
  const nestedSources = [
    entry.download,
    entry.asset,
    entry.document,
    entry.file,
    entry.payload,
    entry.value
  ];
  nestedSources.push(
    ...Array.isArray(entry.urls) ? entry.urls : [],
    ...Array.isArray(entry.links) ? entry.links : []
  );
  if (entry.urls && typeof entry.urls === "object") {
    nestedSources.push(...Object.values(entry.urls));
  }
  if (entry.links && typeof entry.links === "object") {
    nestedSources.push(...Object.values(entry.links));
  }
  for (const nested of nestedSources) {
    if (!nested)
      continue;
    const nestedUrl = extractUrl(nested, visited);
    if (nestedUrl) {
      return nestedUrl;
    }
  }
  for (const value of Object.values(entry)) {
    if (typeof value === "string" && isLikelyUrl(value)) {
      return value.trim();
    }
  }
  return "";
}
function deriveType(entry = {}, fallbackType = "", index2 = 0) {
  const candidates = [entry.type, entry.name, entry.label, fallbackType];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return `file_${index2 + 1}`;
}
function sanitizeStringValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}
function sanitizeTimestampValue(value) {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) {
      return "";
    }
    return value.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString();
  }
  return "";
}
function sanitizeTemplateMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return void 0;
  }
  const sanitized = {};
  TEMPLATE_META_STRING_FIELDS.forEach((key) => {
    const value = meta[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        sanitized[key] = trimmed;
      }
    }
  });
  return Object.keys(sanitized).length ? sanitized : void 0;
}
function sanitizePresentationMeta(presentation) {
  if (!presentation || typeof presentation !== "object") {
    return void 0;
  }
  const sanitized = {};
  PRESENTATION_STRING_FIELDS.forEach((key) => {
    const value = presentation[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        sanitized[key] = trimmed;
      }
    }
  });
  if (Number.isFinite(presentation.autoPreviewPriority)) {
    sanitized.autoPreviewPriority = presentation.autoPreviewPriority;
  }
  return Object.keys(sanitized).length ? sanitized : void 0;
}
function sanitizeNormalizedEntry(entry, index2 = 0, options = {}) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const sanitized = {};
  const type = sanitizeStringValue(entry.type) || `file_${index2 + 1}`;
  const url = sanitizeStringValue(entry.url);
  if (!url && !options.allowEmptyUrls) {
    reportNormalizationIssue(options, {
      code: "missing_url",
      entry,
      index: index2,
      type
    });
    return null;
  }
  sanitized.type = type;
  sanitized.url = url || "";
  if (entry.__issue) {
    sanitized.__issue = entry.__issue;
  }
  PRESERVED_STRING_FIELDS.forEach((key) => {
    const value = sanitizeStringValue(entry[key]);
    if (value) {
      sanitized[key] = value;
    }
  });
  const text = typeof entry.text === "string" ? entry.text.trim() : "";
  if (text) {
    sanitized.text = text;
  }
  const generatedAt = sanitizeTimestampValue(entry.generatedAt);
  if (generatedAt) {
    sanitized.generatedAt = generatedAt;
  }
  const updatedAt = sanitizeTimestampValue(entry.updatedAt);
  if (updatedAt) {
    sanitized.updatedAt = updatedAt;
  }
  const expiresAt = sanitizeTimestampValue(entry.expiresAt);
  if (expiresAt) {
    sanitized.expiresAt = expiresAt;
  }
  const templateMeta = sanitizeTemplateMeta(entry.templateMeta);
  if (templateMeta) {
    sanitized.templateMeta = templateMeta;
  }
  const presentation = sanitizePresentationMeta(entry.presentation);
  if (presentation) {
    sanitized.presentation = presentation;
  }
  return sanitized;
}
function reportNormalizationIssue(options, issue) {
  if (!options || typeof options.onIssue !== "function") {
    return;
  }
  try {
    options.onIssue(issue);
  } catch (err) {
    if (typeof console !== "undefined" && (console == null ? void 0 : console.warn)) {
      console.warn("normalizeOutputFiles issue callback failed", err);
    }
  }
}
function normaliseOutputFileEntry(entry, index2 = 0, fallbackType = "", options = {}) {
  var _a, _b;
  if (!entry)
    return null;
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed)
      return null;
    return {
      type: fallbackType || `file_${index2 + 1}`,
      url: trimmed
    };
  }
  if (typeof entry !== "object") {
    return null;
  }
  const derivedType = deriveType(entry, fallbackType, index2);
  const url = extractUrl(entry);
  if (!url) {
    reportNormalizationIssue(options, {
      code: "missing_url",
      entry,
      index: index2,
      type: derivedType
    });
    if (!options.allowEmptyUrls) {
      return null;
    }
    const normalized2 = {
      ...entry,
      url: "",
      type: derivedType,
      __issue: "missing_url"
    };
    if (hasTrustedMetadata(normalized2)) {
      normalized2.__trusted = true;
    }
    const expiresAt2 = resolveExpiresAt(entry, options);
    if (expiresAt2) {
      normalized2.expiresAt = expiresAt2;
    } else if ("expiresAt" in normalized2) {
      delete normalized2.expiresAt;
    }
    if (typeof normalized2.text !== "string" && typeof ((_a = entry == null ? void 0 : entry.download) == null ? void 0 : _a.text) === "string") {
      normalized2.text = entry.download.text;
    }
    return normalized2;
  }
  const normalized = {
    ...entry,
    url
  };
  if (hasTrustedMetadata(normalized)) {
    normalized.__trusted = true;
  }
  const expiresAt = resolveExpiresAt(entry, options);
  if (expiresAt) {
    normalized.expiresAt = expiresAt;
  } else if ("expiresAt" in normalized) {
    delete normalized.expiresAt;
  }
  if (typeof normalized.text !== "string" && typeof ((_b = entry == null ? void 0 : entry.download) == null ? void 0 : _b.text) === "string") {
    normalized.text = entry.download.text;
  }
  normalized.type = derivedType;
  return normalized;
}
function computeRetentionPriority(entry) {
  if (isUserSelectedEntry(entry)) {
    return 0;
  }
  if (isAutoEnhancedEntry(entry)) {
    return 1;
  }
  return 2;
}
function parseTimestampValue(value) {
  if (value == null)
    return 0;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? 0 : time;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1e3;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed)
      return 0;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1e3;
    }
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }
  return 0;
}
function buildCandidateMeta(entry, index2) {
  return {
    entry,
    index: index2,
    firstIndex: index2,
    priority: computeRetentionPriority(entry),
    timestamp: parseTimestampValue(entry.generatedAt) || parseTimestampValue(entry.updatedAt) || parseTimestampValue(entry.refreshedAt) || parseTimestampValue(entry.expiresAt) || parseTimestampValue(entry.expires_at)
  };
}
function isBetterCandidate(candidate, existing) {
  if (candidate.priority < existing.priority) {
    return true;
  }
  if (candidate.priority > existing.priority) {
    return false;
  }
  if (candidate.timestamp > existing.timestamp) {
    return true;
  }
  if (candidate.timestamp < existing.timestamp) {
    return false;
  }
  return candidate.index > existing.index;
}
function dedupePreferredEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const retentionMap = /* @__PURE__ */ new Map();
  entries.forEach((entry, index2) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    if (isMarkedTestOrStale(entry)) {
      return;
    }
    const candidate = buildCandidateMeta(entry, index2);
    if (candidate.priority > 1) {
      return;
    }
    const key = toLowerSafe$1(entry.type) || `file_${index2 + 1}`;
    const existing = retentionMap.get(key);
    if (!existing) {
      retentionMap.set(key, candidate);
      return;
    }
    if (isBetterCandidate(candidate, existing)) {
      retentionMap.set(key, { ...candidate, firstIndex: existing.firstIndex });
    } else if (existing.firstIndex > candidate.index) {
      existing.firstIndex = candidate.index;
    }
  });
  return Array.from(retentionMap.values()).sort((a, b) => a.firstIndex - b.firstIndex).map((item) => item.entry);
}
function finalizeNormalizedEntries(entries, options = {}) {
  return dedupePreferredEntries(entries).map((entry, index2) => sanitizeNormalizedEntry(entry, index2, options)).filter(Boolean);
}
function normalizeOutputFiles(rawInput, options = {}) {
  if (!rawInput) {
    return [];
  }
  const normalized = [];
  if (Array.isArray(rawInput)) {
    rawInput.forEach((entry, index2) => {
      const normalizedEntry = normaliseOutputFileEntry(entry, index2, "", options);
      if (normalizedEntry) {
        normalized.push(normalizedEntry);
      }
    });
    return finalizeNormalizedEntries(normalized, options);
  }
  if (typeof rawInput === "string") {
    const trimmed = rawInput.trim();
    if (!trimmed)
      return [];
    const sanitized = sanitizeNormalizedEntry(
      { type: "file_1", url: trimmed },
      0,
      options
    );
    return sanitized ? [sanitized] : [];
  }
  if (typeof rawInput === "object") {
    Object.entries(rawInput).forEach(([key, value], index2) => {
      const normalizedEntry = normaliseOutputFileEntry(value, index2, key, options);
      if (normalizedEntry) {
        if (!normalizedEntry.type && typeof key === "string" && key.trim()) {
          normalizedEntry.type = key.trim();
        }
        normalized.push(normalizedEntry);
      }
    });
  }
  return finalizeNormalizedEntries(normalized, options);
}
function toLowerSafe(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function detectPdfSignature(bytes) {
  if (!bytes || typeof bytes.length !== "number") {
    return false;
  }
  if (bytes.length < 4) {
    return false;
  }
  return bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
}
async function normalizePdfBlob(blob, { contentType = "" } = {}) {
  if (!blob) {
    const error = new Error("Downloaded document is unavailable.");
    error.code = "EMPTY_PDF_CONTENT";
    throw error;
  }
  const declaredType = toLowerSafe(contentType) || toLowerSafe(blob.type);
  const suspiciousTextType = declaredType.startsWith("text/") || declaredType === "application/json" || declaredType === "application/xml";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) {
    const error = new Error("Downloaded document is empty.");
    error.code = "EMPTY_PDF_CONTENT";
    throw error;
  }
  if (!detectPdfSignature(bytes)) {
    const error = new Error(
      suspiciousTextType ? "Received text content instead of a PDF document." : "Downloaded document is not a valid PDF."
    );
    error.code = suspiciousTextType ? "NON_PDF_CONTENT" : "INVALID_PDF_SIGNATURE";
    throw error;
  }
  if (declaredType.includes("pdf") && toLowerSafe(blob.type).includes("pdf")) {
    return { blob, contentType: "application/pdf" };
  }
  return { blob: new Blob([bytes], { type: "application/pdf" }), contentType: "application/pdf" };
}
const CATEGORY_METADATA = {
  ats: {
    key: "ats",
    label: "ATS",
    description: "Score movement and JD alignment rationale."
  },
  skills: {
    key: "skills",
    label: "Skills",
    description: "Keyword coverage surfaced across the resume."
  },
  designation: {
    key: "designation",
    label: "Designation",
    description: "Visible job titles aligned to the target role."
  },
  tasks: {
    key: "tasks",
    label: "Tasks",
    description: "Experience bullets, responsibilities, and project highlights."
  },
  highlights: {
    key: "highlights",
    label: "Highlights",
    description: "Headline wins and summary messaging that were refreshed."
  },
  certs: {
    key: "certs",
    label: "Certifications",
    description: "Credentials emphasised for the JD."
  }
};
const CATEGORY_ORDER = ["ats", "skills", "designation", "tasks", "highlights", "certs"];
const SECTION_CATEGORY_MATCHERS = [
  { keys: ["skills"], pattern: /skill|keyword/i },
  { keys: ["designation"], pattern: /designation|title|headline|position/i },
  { keys: ["tasks"], pattern: /experience|project|responsibilit|task|achievement|impact/i },
  { keys: ["highlights"], pattern: /highlight|summary|profile|overview/i },
  { keys: ["certs"], pattern: /cert|badge|accredit/i },
  {
    keys: ["ats"],
    pattern: /ats|layout|readability|candidatescore|impact metric|probability|quality/i
  }
];
const PRIMARY_CATEGORY_BY_SUGGESTION = {
  "improve-summary": "highlights",
  "add-missing-skills": "skills",
  "align-experience": "tasks",
  "change-designation": "designation",
  "improve-certifications": "certs",
  "improve-projects": "tasks",
  "improve-highlights": "highlights"
};
const RELATED_CATEGORIES_BY_SUGGESTION = {
  "improve-summary": ["ats", "highlights"],
  "add-missing-skills": ["ats", "skills"],
  "align-experience": ["ats", "tasks", "highlights"],
  "change-designation": ["ats", "designation"],
  "improve-certifications": ["ats", "certs", "skills"],
  "improve-projects": ["ats", "tasks", "highlights"],
  "improve-highlights": ["ats", "highlights"],
  "enhance-all": ["ats", "skills", "designation", "tasks", "highlights", "certs"]
};
function normaliseList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item === null || item === void 0) {
        return "";
      }
      return String(item || "").trim();
    }).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (value === null || value === void 0) {
    return [];
  }
  return [String(value || "").trim()].filter(Boolean);
}
function resolveSectionCategories(sectionLabel) {
  if (!sectionLabel) {
    return [];
  }
  const lower = sectionLabel.toLowerCase();
  const matched = /* @__PURE__ */ new Set();
  SECTION_CATEGORY_MATCHERS.forEach((matcher) => {
    if (matcher.pattern.test(lower)) {
      matcher.keys.forEach((key) => matched.add(key));
    }
  });
  return Array.from(matched);
}
function ensureCategoryEntry(map, key) {
  if (!CATEGORY_METADATA[key]) {
    return null;
  }
  if (!map.has(key)) {
    map.set(key, {
      key,
      label: CATEGORY_METADATA[key].label,
      description: CATEGORY_METADATA[key].description,
      added: /* @__PURE__ */ new Set(),
      removed: /* @__PURE__ */ new Set(),
      reasons: /* @__PURE__ */ new Set()
    });
  }
  return map.get(key);
}
function pushItems(targetSet, items) {
  normaliseList(items).forEach((item) => {
    if (!item)
      return;
    targetSet.add(item);
  });
}
function pushReasons(targetSet, reasons) {
  normaliseList(reasons).forEach((reason) => {
    if (!reason)
      return;
    const lower = reason.toLowerCase();
    if (!Array.from(targetSet).some((existing) => existing.toLowerCase() === lower)) {
      targetSet.add(reason);
    }
  });
}
function addScoreDeltaReason(categoryEntry, scoreDelta) {
  if (!categoryEntry)
    return;
  if (typeof scoreDelta !== "number" || Number.isNaN(scoreDelta) || !Number.isFinite(scoreDelta)) {
    return;
  }
  if (scoreDelta === 0) {
    categoryEntry.reasons.add("Confirmed the ATS score stayed stable after the change.");
    return;
  }
  const rounded = Math.round(scoreDelta);
  const prefix = rounded > 0 ? "+" : "";
  categoryEntry.reasons.add(`Score impact: ${prefix}${rounded} pts versus the baseline upload.`);
}
function buildCategoryChangeLog({
  summarySegments = [],
  detail,
  addedItems = [],
  removedItems = [],
  itemizedChanges = [],
  before,
  after,
  scoreDelta = null,
  suggestionType
} = {}) {
  const detailText = typeof detail === "string" ? detail.trim() : "";
  const categoryMap = /* @__PURE__ */ new Map();
  const segments = Array.isArray(summarySegments) ? summarySegments : [];
  segments.forEach((rawSegment) => {
    if (!rawSegment || typeof rawSegment !== "object") {
      return;
    }
    const sectionLabel = typeof rawSegment.section === "string" ? rawSegment.section : typeof rawSegment.label === "string" ? rawSegment.label : typeof rawSegment.key === "string" ? rawSegment.key : "";
    const sectionCategories = resolveSectionCategories(sectionLabel);
    if (sectionCategories.length === 0) {
      return;
    }
    const segmentAdded = normaliseList(rawSegment.added);
    const segmentRemoved = normaliseList(rawSegment.removed);
    const segmentReason = normaliseList(rawSegment.reason);
    const reasonsToUse = segmentReason.length > 0 ? segmentReason : detailText ? [detailText] : [];
    sectionCategories.forEach((categoryKey) => {
      const entry = ensureCategoryEntry(categoryMap, categoryKey);
      if (!entry)
        return;
      pushItems(entry.added, segmentAdded);
      pushItems(entry.removed, segmentRemoved);
      pushReasons(entry.reasons, reasonsToUse);
    });
  });
  const suggestionKey = typeof suggestionType === "string" ? suggestionType.trim() : "";
  const primaryCategory = PRIMARY_CATEGORY_BY_SUGGESTION[suggestionKey] || null;
  if (primaryCategory) {
    const entry = ensureCategoryEntry(categoryMap, primaryCategory);
    if (entry) {
      pushItems(entry.added, addedItems);
      pushItems(entry.removed, removedItems);
      if (entry.reasons.size === 0 && detailText) {
        entry.reasons.add(detailText);
      }
    }
  }
  if (Array.isArray(itemizedChanges) && itemizedChanges.length > 0) {
    const fallbackCategory = primaryCategory || (RELATED_CATEGORIES_BY_SUGGESTION[suggestionKey] || [])[0];
    if (fallbackCategory) {
      const entry = ensureCategoryEntry(categoryMap, fallbackCategory);
      if (entry) {
        itemizedChanges.forEach((change) => {
          if (!change || typeof change !== "object")
            return;
          const reasons = normaliseList(change.reasons);
          pushReasons(entry.reasons, reasons);
        });
      }
    }
  }
  if (suggestionKey === "change-designation" && before && after && before !== after) {
    const entry = ensureCategoryEntry(categoryMap, "designation");
    if (entry) {
      entry.reasons.add("Updated your visible title to align with the JD role name.");
      pushItems(entry.added, after);
      pushItems(entry.removed, before);
    }
  }
  if (suggestionKey === "enhance-all") {
    const related = RELATED_CATEGORIES_BY_SUGGESTION[suggestionKey] || [];
    related.forEach((key) => {
      const entry = ensureCategoryEntry(categoryMap, key);
      if (entry && detailText) {
        entry.reasons.add(detailText);
      }
    });
  }
  const relatedCategories = RELATED_CATEGORIES_BY_SUGGESTION[suggestionKey] || [];
  relatedCategories.forEach((key) => {
    const entry = ensureCategoryEntry(categoryMap, key);
    if (!entry)
      return;
    if (entry.reasons.size === 0 && detailText) {
      entry.reasons.add(detailText);
    }
  });
  if (detailText) {
    const atsEntry = ensureCategoryEntry(categoryMap, "ats");
    if (atsEntry && atsEntry.reasons.size === 0) {
      atsEntry.reasons.add(detailText);
    }
  }
  addScoreDeltaReason(categoryMap.get("ats"), scoreDelta);
  const result = CATEGORY_ORDER.map((key) => {
    const entry = categoryMap.get(key);
    if (!entry) {
      return null;
    }
    const added = Array.from(entry.added);
    const removed = Array.from(entry.removed);
    const reasons = Array.from(entry.reasons);
    if (added.length === 0 && removed.length === 0 && reasons.length === 0) {
      return null;
    }
    return {
      key,
      label: entry.label,
      description: entry.description,
      added,
      removed,
      reasons
    };
  }).filter(Boolean);
  return result;
}
const HIGHLIGHT_LABEL_OVERRIDES = {
  designation: {
    changed: "Designation changed"
  },
  ats: {
    reasons: "ATS rationale"
  }
};
const SECTION_LABEL_OVERRIDES = {
  summary: "Summary",
  skills: "Skills",
  experience: "Work Experience",
  certifications: "Certifications",
  projects: "Projects",
  highlights: "Highlights",
  designation: "Designation",
  education: "Education",
  resume: "Entire Resume"
};
function normaliseSummaryString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "";
  }
  if (value === null || value === void 0) {
    return "";
  }
  return String(value || "").trim();
}
function normaliseSummaryList(value) {
  if (Array.isArray(value)) {
    return value.map(normaliseSummaryString).filter(Boolean);
  }
  const text = normaliseSummaryString(value);
  return text ? [text] : [];
}
function createCollector() {
  return {
    items: [],
    seen: /* @__PURE__ */ new Set()
  };
}
function addToCollector(collector, values) {
  if (!collector)
    return;
  normaliseSummaryList(values).forEach((item) => {
    const key = item.toLowerCase();
    if (collector.seen.has(key)) {
      return;
    }
    collector.seen.add(key);
    collector.items.push(item);
  });
}
function resolveCategoryKey(category = {}) {
  const directKey = normaliseSummaryString(category.key).toLowerCase();
  if (directKey && CATEGORY_METADATA[directKey]) {
    return directKey;
  }
  const label = normaliseSummaryString(category.label);
  if (label) {
    const lower = label.toLowerCase();
    const matched = Object.entries(CATEGORY_METADATA).find(([, meta]) => meta.label.toLowerCase() === lower);
    if (matched) {
      return matched[0];
    }
    return lower.replace(/[^a-z0-9]+/g, "_") || "general";
  }
  return "general";
}
function resolveCategoryLabel(category = {}, resolvedKey) {
  const metadata = CATEGORY_METADATA[resolvedKey];
  if (metadata == null ? void 0 : metadata.label) {
    return metadata.label;
  }
  const label = normaliseSummaryString(category.label);
  if (label) {
    return label;
  }
  return resolvedKey.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
function resolveCategoryDescription(category = {}, resolvedKey) {
  const metadata = CATEGORY_METADATA[resolvedKey];
  if (metadata == null ? void 0 : metadata.description) {
    return metadata.description;
  }
  const description = normaliseSummaryString(category.description);
  return description;
}
function ensureCategoryBucket(map, category, resolvedKey) {
  const key = resolvedKey || resolveCategoryKey(category);
  if (!map.has(key)) {
    map.set(key, {
      key,
      label: resolveCategoryLabel(category, key),
      description: resolveCategoryDescription(category, key),
      added: createCollector(),
      removed: createCollector(),
      reasons: createCollector()
    });
  } else {
    const bucket = map.get(key);
    const label = resolveCategoryLabel(category, key);
    if (label && bucket.label !== label) {
      bucket.label = label;
    }
    const description = resolveCategoryDescription(category, key);
    if (description && !bucket.description) {
      bucket.description = description;
    }
  }
  return map.get(key);
}
function buildCategoryEntriesForChange(entry = {}) {
  if (Array.isArray(entry.categoryChangelog) && entry.categoryChangelog.length > 0) {
    return entry.categoryChangelog;
  }
  return buildCategoryChangeLog({
    summarySegments: entry.summarySegments,
    detail: entry.detail,
    addedItems: entry.addedItems,
    removedItems: entry.removedItems,
    itemizedChanges: entry.itemizedChanges,
    before: entry.before,
    after: entry.after,
    scoreDelta: entry.scoreDelta,
    suggestionType: entry.type
  });
}
function finaliseCategory(bucket) {
  if (!bucket)
    return null;
  const added = bucket.added.items;
  const removed = bucket.removed.items;
  const reasons = bucket.reasons.items;
  if (added.length === 0 && removed.length === 0 && reasons.length === 0) {
    return null;
  }
  return {
    key: bucket.key,
    label: bucket.label,
    description: bucket.description,
    added,
    removed,
    reasons,
    totalAdded: added.length,
    totalRemoved: removed.length,
    totalReasons: reasons.length,
    totalChanges: added.length + removed.length
  };
}
function buildDesignationChanges(category) {
  const collector = createCollector();
  const pairCount = Math.min(category.removed.length, category.added.length);
  for (let index2 = 0; index2 < pairCount; index2 += 1) {
    const from = normaliseSummaryString(category.removed[index2]);
    const to = normaliseSummaryString(category.added[index2]);
    if (!from || !to)
      continue;
    const summary = `${from} → ${to}`;
    addToCollector(collector, [summary]);
  }
  return collector.items;
}
function getHighlightLabel(categoryKey, type, fallback) {
  const overrides = HIGHLIGHT_LABEL_OVERRIDES[categoryKey];
  if (overrides && overrides[type]) {
    return overrides[type];
  }
  const metadata = CATEGORY_METADATA[categoryKey];
  const labelBase = (metadata == null ? void 0 : metadata.label) || fallback || categoryKey;
  switch (type) {
    case "added":
      return `${labelBase} added`;
    case "removed":
      return `${labelBase} removed`;
    case "changed":
      return `${labelBase} changed`;
    case "reasons":
      return `${labelBase} rationale`;
    default:
      return fallback || labelBase;
  }
}
function formatInterviewList(values = [], { limit = 4 } = {}) {
  if (!Array.isArray(values) || !values.length) {
    return "";
  }
  const seen = /* @__PURE__ */ new Set();
  const ordered = [];
  values.forEach((value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
      return;
    const lower = text.toLowerCase();
    if (seen.has(lower))
      return;
    seen.add(lower);
    ordered.push(text);
  });
  if (ordered.length === 0) {
    return "";
  }
  if (ordered.length === 1) {
    return ordered[0];
  }
  if (ordered.length === 2) {
    return `${ordered[0]} and ${ordered[1]}`;
  }
  const truncated = ordered.slice(0, limit);
  if (ordered.length > limit) {
    return `${truncated.join(", ")} and ${ordered.length - limit} more`;
  }
  return `${truncated.slice(0, -1).join(", ")} and ${truncated.slice(-1)}`;
}
function buildInterviewPrepAdvice(categories2 = [], highlights = []) {
  const addedSkillItems = [];
  categories2.forEach((category) => {
    if (!category || category.key !== "skills")
      return;
    if (Array.isArray(category.added)) {
      addedSkillItems.push(...category.added);
    }
  });
  highlights.forEach((highlight) => {
    if (!highlight || highlight.category !== "skills" || highlight.type !== "added") {
      return;
    }
    if (Array.isArray(highlight.items)) {
      addedSkillItems.push(...highlight.items);
    }
  });
  const formatted = formatInterviewList(addedSkillItems);
  if (formatted) {
    return `We added ${formatted}; prepare for questions.`;
  }
  if (Array.isArray(categories2) && categories2.length > 0) {
    return "These JD-aligned additions were applied so you can prep for interview conversations with confidence.";
  }
  return "";
}
function buildHighlights(categories2 = []) {
  const highlights = [];
  categories2.forEach((category) => {
    if (category.key === "designation") {
      const transitions = buildDesignationChanges(category);
      if (transitions.length > 0) {
        highlights.push({
          key: "designation:changed",
          category: "designation",
          label: getHighlightLabel("designation", "changed", "Designation changed"),
          type: "changed",
          items: transitions,
          count: transitions.length
        });
      } else if (category.added.length > 0) {
        highlights.push({
          key: "designation:added",
          category: "designation",
          label: getHighlightLabel("designation", "added", "Designation added"),
          type: "added",
          items: category.added,
          count: category.added.length
        });
      }
      if (category.removed.length > 0) {
        highlights.push({
          key: "designation:removed",
          category: "designation",
          label: getHighlightLabel("designation", "removed", "Designation removed"),
          type: "removed",
          items: category.removed,
          count: category.removed.length
        });
      }
      return;
    }
    if (category.added.length > 0) {
      highlights.push({
        key: `${category.key}:added`,
        category: category.key,
        label: getHighlightLabel(category.key, "added", `${category.label} added`),
        type: "added",
        items: category.added,
        count: category.added.length
      });
    }
    if (category.removed.length > 0) {
      highlights.push({
        key: `${category.key}:removed`,
        category: category.key,
        label: getHighlightLabel(category.key, "removed", `${category.label} removed`),
        type: "removed",
        items: category.removed,
        count: category.removed.length
      });
    }
    if (category.reasons.length > 0 && ["ats"].includes(category.key)) {
      highlights.push({
        key: `${category.key}:reasons`,
        category: category.key,
        label: getHighlightLabel(category.key, "reasons", `${category.label} rationale`),
        type: "reasons",
        items: category.reasons,
        count: category.reasons.length
      });
    }
  });
  return highlights;
}
function canonicaliseSectionKey(value) {
  const text = normaliseSummaryString(value);
  if (!text)
    return "";
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}
function isKnownSectionKey(key) {
  const canonical = canonicaliseSectionKey(key);
  if (!canonical)
    return false;
  return Boolean(SECTION_LABEL_OVERRIDES[canonical]);
}
function resolveSectionLabel(key, label) {
  const direct = normaliseSummaryString(label);
  if (direct) {
    return direct;
  }
  const keyCandidate = canonicaliseSectionKey(key);
  if (keyCandidate && SECTION_LABEL_OVERRIDES[keyCandidate]) {
    return SECTION_LABEL_OVERRIDES[keyCandidate];
  }
  if (keyCandidate) {
    return keyCandidate.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return "";
}
function mergeSectionChange(sectionMap, section, weight = 1) {
  if (!sectionMap)
    return;
  const label = resolveSectionLabel(section.key, section.label || section.section);
  const key = canonicaliseSectionKey(section.key) || canonicaliseSectionKey(label);
  if (!key && !label) {
    return;
  }
  const existing = sectionMap.get(key) || { key, label, count: 0 };
  if (label && !existing.label) {
    existing.label = label;
  }
  const increment = Number.isFinite(weight) && weight > 0 ? weight : 1;
  existing.count += increment;
  if (!existing.label) {
    existing.label = resolveSectionLabel(key);
  }
  sectionMap.set(key, existing);
}
function buildSectionChanges(entries = []) {
  const sectionMap = /* @__PURE__ */ new Map();
  const safeEntries = Array.isArray(entries) ? entries : [];
  safeEntries.forEach((entry) => {
    if (!entry || entry.reverted) {
      return;
    }
    const sections = Array.isArray(entry.sectionChanges) ? entry.sectionChanges : [];
    if (sections.length === 0 && Array.isArray(entry.summarySegments)) {
      entry.summarySegments.forEach((segment) => {
        if (!segment)
          return;
        mergeSectionChange(sectionMap, { key: segment.section, label: segment.section });
      });
      return;
    }
    sections.forEach((section) => {
      if (!section)
        return;
      const weight = Number.isFinite(section.count) ? Number(section.count) : 1;
      mergeSectionChange(sectionMap, section, weight);
    });
    const categories2 = Array.isArray(entry.categoryChangelog) ? entry.categoryChangelog : [];
    categories2.forEach((category) => {
      if (!category)
        return;
      if (!isKnownSectionKey(category.key))
        return;
      mergeSectionChange(sectionMap, { key: category.key, label: category.label });
    });
  });
  return Array.from(sectionMap.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.label.localeCompare(b.label);
  });
}
function buildTotals(entries, categories2, highlights) {
  const activeEntries = Array.isArray(entries) ? entries.filter((entry) => entry && !entry.reverted) : [];
  const addedItems = categories2.reduce((sum, category) => sum + category.added.length, 0);
  const removedItems = categories2.reduce((sum, category) => sum + category.removed.length, 0);
  return {
    entries: activeEntries.length,
    categories: categories2.length,
    highlights: highlights.length,
    addedItems,
    removedItems
  };
}
function buildAggregatedChangeLogSummary(entries = []) {
  const categoryMap = /* @__PURE__ */ new Map();
  const safeEntries = Array.isArray(entries) ? entries : [];
  safeEntries.forEach((entry) => {
    if (entry == null ? void 0 : entry.reverted) {
      return;
    }
    const categories2 = buildCategoryEntriesForChange(entry);
    categories2.forEach((category) => {
      if (!category)
        return;
      const bucket = ensureCategoryBucket(categoryMap, category);
      addToCollector(bucket.added, category.added);
      addToCollector(bucket.removed, category.removed);
      addToCollector(bucket.reasons, category.reasons);
    });
  });
  const ordered = [];
  const consumedKeys = /* @__PURE__ */ new Set();
  CATEGORY_ORDER.forEach((key) => {
    if (categoryMap.has(key)) {
      const category = finaliseCategory(categoryMap.get(key));
      if (category) {
        ordered.push(category);
      }
      consumedKeys.add(key);
    }
  });
  categoryMap.forEach((bucket, key) => {
    if (consumedKeys.has(key)) {
      return;
    }
    const category = finaliseCategory(bucket);
    if (category) {
      ordered.push(category);
    }
  });
  const highlights = buildHighlights(ordered);
  const totals = buildTotals(safeEntries, ordered, highlights);
  const interviewPrepAdvice = buildInterviewPrepAdvice(ordered, highlights);
  const sections = buildSectionChanges(safeEntries);
  return {
    categories: ordered,
    highlights,
    totals,
    interviewPrepAdvice,
    sections
  };
}
const LAMBDA_PROCESSING_ERROR_MESSAGE = "Our Lambda resume engine is temporarily unavailable. Please try again shortly.";
const CV_GENERATION_ERROR_MESSAGE = "Our Lambda resume engine could not generate your PDFs. Please try again shortly.";
const COVER_LETTER_GENERATION_ERROR_MESSAGE = "Our Lambda resume engine could not generate your cover letter PDF. Please try again shortly.";
const GEMINI_ENHANCEMENT_ERROR_MESSAGE = "Gemini enhancements are temporarily offline. Please try again soon.";
const S3_STORAGE_ERROR_MESSAGE = "Amazon S3 storage is temporarily unavailable. Please try again in a few minutes.";
const S3_CHANGE_LOG_ERROR_MESSAGE = "Amazon S3 is currently unavailable, so we could not save your updates. Please retry shortly.";
const DOWNLOAD_SESSION_EXPIRED_MESSAGE = "Your download session expired. Regenerate the documents to get new links.";
const API_ERROR_CONTRACTS = Object.freeze({
  INITIAL_UPLOAD_FAILED: {
    code: "INITIAL_UPLOAD_FAILED",
    friendlyMessage: S3_STORAGE_ERROR_MESSAGE,
    service: "s3",
    step: "upload"
  },
  STORAGE_UNAVAILABLE: {
    code: "STORAGE_UNAVAILABLE",
    friendlyMessage: S3_STORAGE_ERROR_MESSAGE,
    service: "s3",
    step: "download"
  },
  CHANGE_LOG_PERSISTENCE_FAILED: {
    code: "CHANGE_LOG_PERSISTENCE_FAILED",
    friendlyMessage: S3_CHANGE_LOG_ERROR_MESSAGE,
    service: "s3",
    step: "enhance"
  },
  DOCUMENT_GENERATION_FAILED: {
    code: "DOCUMENT_GENERATION_FAILED",
    friendlyMessage: LAMBDA_PROCESSING_ERROR_MESSAGE,
    service: "lambda",
    step: "generate"
  },
  PROCESSING_FAILED: {
    code: "PROCESSING_FAILED",
    friendlyMessage: LAMBDA_PROCESSING_ERROR_MESSAGE,
    service: "lambda",
    step: "score"
  },
  GENERATION_FAILED: {
    code: "GENERATION_FAILED",
    friendlyMessage: LAMBDA_PROCESSING_ERROR_MESSAGE,
    service: "lambda",
    step: "generate"
  },
  PDF_GENERATION_FAILED: {
    code: "PDF_GENERATION_FAILED",
    friendlyMessage: CV_GENERATION_ERROR_MESSAGE,
    service: "lambda",
    step: "generate"
  },
  COVER_LETTER_GENERATION_FAILED: {
    code: "COVER_LETTER_GENERATION_FAILED",
    friendlyMessage: COVER_LETTER_GENERATION_ERROR_MESSAGE,
    service: "lambda",
    step: "generate"
  },
  AI_RESPONSE_INVALID: {
    code: "AI_RESPONSE_INVALID",
    friendlyMessage: GEMINI_ENHANCEMENT_ERROR_MESSAGE,
    service: "gemini",
    step: "enhance"
  },
  DOWNLOAD_SESSION_EXPIRED: {
    code: "DOWNLOAD_SESSION_EXPIRED",
    friendlyMessage: DOWNLOAD_SESSION_EXPIRED_MESSAGE,
    service: "s3",
    step: "download"
  }
});
const FRIENDLY_ERROR_MESSAGES = Object.freeze(
  Object.fromEntries(
    Object.entries(API_ERROR_CONTRACTS).map(([code, contract]) => [
      code,
      contract.friendlyMessage
    ])
  )
);
const SERVICE_ERROR_SOURCE_BY_CODE = Object.freeze(
  Object.fromEntries(
    Object.entries(API_ERROR_CONTRACTS).map(([code, contract]) => [
      code,
      contract.service || ""
    ])
  )
);
const SERVICE_ERROR_STEP_BY_CODE = Object.freeze(
  Object.fromEntries(
    Object.entries(API_ERROR_CONTRACTS).map(([code, contract]) => [
      code,
      contract.step || ""
    ])
  )
);
const SERVICE_ERROR_STEP_BY_SOURCE = Object.freeze({
  s3: "download",
  lambda: "score",
  gemini: "enhance"
});
function normalizeServiceSource(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  return ["s3", "lambda", "gemini"].includes(normalized) ? normalized : "";
}
function deriveServiceContextFromError(err) {
  var _a, _b, _c;
  if (!err || typeof err !== "object") {
    return { source: "", code: "" };
  }
  const rawCode = typeof err.code === "string" ? err.code.trim().toUpperCase() : "";
  const sourceCandidates = [
    err.serviceError,
    err.source,
    (_a = err == null ? void 0 : err.details) == null ? void 0 : _a.source,
    (_c = (_b = err == null ? void 0 : err.error) == null ? void 0 : _b.details) == null ? void 0 : _c.source
  ];
  let normalizedSourceCandidate = "";
  for (const candidate of sourceCandidates) {
    const normalized = normalizeServiceSource(candidate);
    if (normalized) {
      normalizedSourceCandidate = normalized;
      break;
    }
  }
  const mappedSourceFromCode = rawCode ? normalizeServiceSource(SERVICE_ERROR_SOURCE_BY_CODE[rawCode] || "") : "";
  const source = normalizedSourceCandidate || mappedSourceFromCode;
  return { source, code: rawCode };
}
function extractServerMessages(data) {
  var _a, _b, _c;
  const candidates = [];
  if (Array.isArray(data == null ? void 0 : data.messages)) {
    candidates.push(...data.messages);
  }
  if (Array.isArray((_b = (_a = data == null ? void 0 : data.error) == null ? void 0 : _a.details) == null ? void 0 : _b.messages)) {
    candidates.push(...data.error.details.messages);
  }
  if (Array.isArray((_c = data == null ? void 0 : data.error) == null ? void 0 : _c.messages)) {
    candidates.push(...data.error.messages);
  }
  const seen = /* @__PURE__ */ new Set();
  const normalized = [];
  for (const entry of candidates) {
    if (typeof entry !== "string")
      continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed))
      continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
function coerceString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function buildLogEntry(channel, value) {
  if (value === null || value === void 0) {
    return null;
  }
  const normalizedChannel = coerceString(channel) || "log";
  if (typeof value === "string") {
    const message2 = value.trim();
    if (!message2) {
      return null;
    }
    return {
      channel: normalizedChannel,
      message: message2
    };
  }
  if (typeof value !== "object") {
    return null;
  }
  const bucket = coerceString(value.bucket);
  const key = coerceString(value.key);
  const status = coerceString(value.status);
  const url = coerceString(value.url);
  const requestId = coerceString(value.requestId);
  const region = coerceString(value.region);
  const location = coerceString(value.location);
  const message = coerceString(value.message) || coerceString(value.description) || coerceString(value.note);
  const hint = coerceString(value.hint);
  const label = coerceString(value.label) || coerceString(value.name);
  const timestamp = coerceString(value.timestamp);
  const type = coerceString(value.type);
  const entry = {
    channel: normalizedChannel
  };
  if (bucket)
    entry.bucket = bucket;
  if (key)
    entry.key = key;
  const resolvedLocation = location || (bucket && key ? `s3://${bucket}/${key}` : "");
  if (resolvedLocation)
    entry.location = resolvedLocation;
  if (status)
    entry.status = status;
  if (url)
    entry.url = url;
  if (requestId)
    entry.requestId = requestId;
  if (region)
    entry.region = region;
  if (message)
    entry.message = message;
  if (hint)
    entry.hint = hint;
  if (label)
    entry.label = label;
  if (timestamp)
    entry.timestamp = timestamp;
  if (type)
    entry.type = type;
  return entry;
}
function normalizeLogReferences(raw) {
  if (!raw) {
    return [];
  }
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  let counter = 0;
  const append = (entry) => {
    if (!entry)
      return;
    const baseId = [
      entry.channel,
      entry.bucket,
      entry.key,
      entry.location,
      entry.url,
      entry.requestId,
      entry.status,
      entry.message,
      entry.timestamp
    ].map((part) => typeof part === "string" ? part : "").filter(Boolean).join("|") || `${entry.channel || "log"}-${counter++}`;
    let id2 = baseId;
    let dedupeIndex = 1;
    while (seen.has(id2)) {
      id2 = `${baseId}-${dedupeIndex++}`;
    }
    seen.add(id2);
    entries.push({ ...entry, id: id2 });
  };
  const handleValue = (channel, value) => {
    const parsed = buildLogEntry(channel, value);
    if (parsed) {
      append(parsed);
    }
  };
  if (Array.isArray(raw)) {
    raw.forEach((value, index2) => {
      if (Array.isArray(value)) {
        value.forEach((nested, nestedIndex) => {
          handleValue(`${index2}[${nestedIndex}]`, nested);
        });
      } else {
        handleValue(`log[${index2}]`, value);
      }
    });
    return entries;
  }
  if (typeof raw === "object") {
    Object.entries(raw).forEach(([channel, value]) => {
      if (Array.isArray(value)) {
        value.forEach((nested, nestedIndex) => {
          handleValue(`${channel}[${nestedIndex}]`, nested);
        });
      } else {
        handleValue(channel, value);
      }
    });
  }
  return entries;
}
function resolveApiError({ data, fallback, status }) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const normalizedFallback = typeof fallback === "string" && fallback.trim() ? fallback.trim() : "Request failed. Please try again.";
  const errorCode = typeof ((_a = data == null ? void 0 : data.error) == null ? void 0 : _a.code) === "string" ? data.error.code.trim() : "";
  const normalizedCode = errorCode ? errorCode.toUpperCase() : "";
  const errorSource = normalizeServiceSource((_c = (_b = data == null ? void 0 : data.error) == null ? void 0 : _b.details) == null ? void 0 : _c.source);
  const rawMessage = typeof ((_d = data == null ? void 0 : data.error) == null ? void 0 : _d.message) === "string" && data.error.message.trim() || typeof (data == null ? void 0 : data.message) === "string" && data.message.trim() || typeof (data == null ? void 0 : data.error) === "string" && data.error.trim() || "";
  const detailSummary = typeof ((_f = (_e = data == null ? void 0 : data.error) == null ? void 0 : _e.details) == null ? void 0 : _f.summary) === "string" ? data.error.details.summary.trim() : "";
  const serverMessages = extractServerMessages(data);
  const fallbackSummary = serverMessages.length > 0 ? serverMessages[serverMessages.length - 1] : "";
  const requestId = typeof ((_g = data == null ? void 0 : data.error) == null ? void 0 : _g.requestId) === "string" ? data.error.requestId.trim() : "";
  const logReferences = normalizeLogReferences((_i = (_h = data == null ? void 0 : data.error) == null ? void 0 : _h.details) == null ? void 0 : _i.logs);
  let friendlyFromCode = "";
  let normalizedSource = errorSource;
  if (!normalizedSource && normalizedCode) {
    normalizedSource = normalizeServiceSource(
      SERVICE_ERROR_SOURCE_BY_CODE[normalizedCode] || ""
    );
  }
  if (normalizedCode && FRIENDLY_ERROR_MESSAGES[normalizedCode]) {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES[normalizedCode];
  } else if (normalizedSource === "s3") {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES.STORAGE_UNAVAILABLE;
  } else if (normalizedSource === "gemini") {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES.AI_RESPONSE_INVALID;
  } else if (normalizedSource === "lambda") {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES.DOCUMENT_GENERATION_FAILED;
  }
  const summaryCandidate = detailSummary || fallbackSummary;
  let messageSource = "raw";
  let message = rawMessage;
  if (summaryCandidate) {
    message = summaryCandidate;
    messageSource = "summary";
  } else if (message) {
    messageSource = "raw";
  }
  if (!message) {
    if (friendlyFromCode) {
      message = friendlyFromCode;
      messageSource = "friendly";
    } else {
      message = normalizedFallback;
      messageSource = "fallback";
    }
  }
  if (!friendlyFromCode && status >= 500 && messageSource !== "summary") {
    if (/gemini/i.test(rawMessage)) {
      message = FRIENDLY_ERROR_MESSAGES.AI_RESPONSE_INVALID;
      messageSource = "friendly";
      if (!normalizedSource) {
        normalizedSource = "gemini";
      }
    } else if (/s3|bucket|accessdenied/i.test(rawMessage)) {
      message = FRIENDLY_ERROR_MESSAGES.STORAGE_UNAVAILABLE;
      messageSource = "friendly";
      if (!normalizedSource) {
        normalizedSource = "s3";
      }
    } else if (/lambda|serverless|invocation|timeout/i.test(rawMessage)) {
      message = FRIENDLY_ERROR_MESSAGES.DOCUMENT_GENERATION_FAILED;
      messageSource = "friendly";
      if (!normalizedSource) {
        normalizedSource = "lambda";
      }
    }
  }
  if (!message || /^internal server error$/i.test(message)) {
    message = normalizedFallback;
    messageSource = "fallback";
  }
  const isFriendly = messageSource === "summary" || messageSource === "friendly" || message !== rawMessage;
  return {
    message,
    code: normalizedCode,
    isFriendly,
    source: normalizedSource,
    logs: logReferences,
    requestId
  };
}
function extractErrorMetadata(err) {
  var _a, _b, _c, _d, _e;
  if (!err || typeof err !== "object") {
    return { logs: [], requestId: "" };
  }
  const requestId = typeof err.requestId === "string" ? err.requestId.trim() : typeof ((_a = err == null ? void 0 : err.details) == null ? void 0 : _a.requestId) === "string" ? err.details.requestId.trim() : typeof ((_b = err == null ? void 0 : err.error) == null ? void 0 : _b.requestId) === "string" ? err.error.requestId.trim() : "";
  if (Array.isArray(err.logs) && err.logs.length > 0) {
    return { logs: err.logs, requestId };
  }
  if (Array.isArray(err.logReferences) && err.logReferences.length > 0) {
    return { logs: err.logReferences, requestId };
  }
  const rawLogs = ((_c = err == null ? void 0 : err.details) == null ? void 0 : _c.logs) || ((_e = (_d = err == null ? void 0 : err.error) == null ? void 0 : _d.details) == null ? void 0 : _e.logs);
  if (rawLogs) {
    const normalized = normalizeLogReferences(rawLogs);
    return { logs: normalized, requestId };
  }
  return { logs: [], requestId };
}
function getBuildVersion() {
  {
    return "3dd942a";
  }
}
const BUILD_VERSION = getBuildVersion();
const TEMPLATE_DISPLAY_NAME_MAP = new Map(
  BASE_TEMPLATE_OPTIONS.map((option) => [option.id, option.name])
);
const SCORE_UPDATE_IN_PROGRESS_MESSAGE = "Please wait for the current ATS score refresh to finish before applying another improvement.";
const POST_DOWNLOAD_INVITE_MESSAGE = "Download complete! Upload another resume or job description, or try a different template to compare results.";
const FLOW_STAGE_KEYS = Object.freeze(["upload", "score", "enhance", "generate", "download"]);
function createStageErrorState() {
  return FLOW_STAGE_KEYS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});
}
function normalizeStageKey(stage) {
  if (typeof stage !== "string") {
    return "";
  }
  const normalized = stage.trim().toLowerCase();
  return FLOW_STAGE_KEYS.includes(normalized) ? normalized : "";
}
const improvementActions = [
  {
    key: "improve-summary",
    label: "Improve Summary",
    helper: "Refresh your summary to mirror the JD tone and keywords.",
    icon: summaryIcon
  },
  {
    key: "add-missing-skills",
    label: "Improve Skills",
    helper: "Blend missing keywords into the skills and experience sections.",
    icon: skillsIcon
  },
  {
    key: "align-experience",
    label: "Improve Experience",
    helper: "Emphasise accomplishments that mirror the job requirements.",
    icon: experienceIcon
  },
  {
    key: "change-designation",
    label: "Improve Designation",
    helper: "Align your visible job title with the target role.",
    icon: designationIcon
  },
  {
    key: "improve-certifications",
    label: "Improve Certifications",
    helper: "Surface credentials that validate your readiness for this JD.",
    icon: certificationsIcon
  },
  {
    key: "improve-projects",
    label: "Improve Projects",
    helper: "Spotlight portfolio wins that map directly to the role priorities.",
    icon: projectsIcon
  },
  {
    key: "improve-highlights",
    label: "Improve Highlights",
    helper: "Refine top achievements so they echo the job’s success metrics.",
    icon: highlightsIcon
  },
  {
    key: "enhance-all",
    label: "Enhance All",
    helper: "Apply every improvement in one pass for a best-fit CV.",
    icon: enhanceIcon
  }
];
const IMPROVE_ALL_BATCH_KEYS = improvementActions.map((action) => action.key).filter((key) => key && key !== "enhance-all");
const METRIC_IMPROVEMENT_PRESETS = [
  {
    category: "Layout & Searchability",
    actionKey: "enhance-all",
    label: "Improve ATS Layout",
    helper: "Streamline structure and sections so ATS bots read your resume without errors."
  },
  {
    category: "Readability",
    actionKey: "enhance-all",
    label: "Boost Readability",
    helper: "Tighten headings and formatting so automated scanners instantly grasp your experience."
  },
  {
    category: "Impact",
    actionKey: "align-experience",
    label: "Improve Experience Impact",
    helper: "Refocus accomplishments on the achievements this JD values most."
  },
  {
    category: "Crispness",
    actionKey: "improve-summary",
    label: "Improve Summary Tone",
    helper: "Sharpen your intro so recruiters see a confident, concise story."
  },
  {
    category: "Other",
    actionKey: "improve-highlights",
    label: "Improve Highlights",
    helper: "Polish standout wins so they pop during quick ATS and recruiter scans."
  }
];
function buildActionDecorator(actionBuilder) {
  return (value) => {
    const text = typeof value === "string" ? value.trim() : String(value || "").trim();
    if (!text)
      return "";
    const action = typeof actionBuilder === "function" ? actionBuilder(text) : "";
    const actionText = typeof action === "string" ? action.trim() : "";
    return actionText ? `${text} (${actionText})` : text;
  };
}
function summariseItems(items, { limit = 5, decorate } = {}) {
  const list = Array.isArray(items) ? items.map((item) => typeof item === "string" ? item.trim() : String(item || "").trim()).filter(Boolean) : [];
  if (!list.length)
    return "";
  const unique = Array.from(new Set(list));
  const decorated = typeof decorate === "function" ? unique.map((value) => decorate(value)).map((value) => typeof value === "string" ? value.trim() : String(value || "").trim()).filter(Boolean) : unique;
  if (!decorated.length)
    return "";
  if (decorated.length <= limit) {
    return decorated.join(", ");
  }
  const shown = decorated.slice(0, limit).join(", ");
  const remaining = decorated.length - limit;
  return `${shown}, and ${remaining} more`;
}
function toUniqueList(items) {
  if (!Array.isArray(items))
    return [];
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  items.forEach((item) => {
    const text = typeof item === "string" ? item.trim() : String(item || "").trim();
    if (!text)
      return;
    const key = text.toLowerCase();
    if (seen.has(key))
      return;
    seen.add(key);
    output.push(text);
  });
  return output;
}
function normalizeImprovementValidation(validation) {
  if (!validation || typeof validation !== "object") {
    return { jobAlignment: { status: "unknown", matchedSkills: [], coveredSkills: [], reason: "" } };
  }
  const jobAlignmentSource = validation.jobAlignment && typeof validation.jobAlignment === "object" ? validation.jobAlignment : {};
  const allowedStatuses = ["passed", "failed", "skipped", "unknown"];
  const statusInput = typeof jobAlignmentSource.status === "string" ? jobAlignmentSource.status.trim().toLowerCase() : "unknown";
  const status = allowedStatuses.includes(statusInput) ? statusInput : "unknown";
  const matchedSkills = toUniqueList(jobAlignmentSource.matchedSkills);
  const coveredSkills = toUniqueList(jobAlignmentSource.coveredSkills);
  const beforeMissingSkills = toUniqueList(jobAlignmentSource.beforeMissingSkills);
  const afterMissingSkills = toUniqueList(jobAlignmentSource.afterMissingSkills);
  const reason = typeof jobAlignmentSource.reason === "string" ? jobAlignmentSource.reason.trim() : "";
  const jobTitleMatched = jobAlignmentSource.jobTitleMatched === true;
  const scoreDelta = typeof jobAlignmentSource.scoreDelta === "number" && Number.isFinite(jobAlignmentSource.scoreDelta) ? jobAlignmentSource.scoreDelta : null;
  const overallScoreDelta = typeof jobAlignmentSource.overallScoreDelta === "number" && Number.isFinite(jobAlignmentSource.overallScoreDelta) ? jobAlignmentSource.overallScoreDelta : null;
  return {
    jobAlignment: {
      status,
      reason,
      matchedSkills,
      coveredSkills,
      beforeMissingSkills,
      afterMissingSkills,
      jobTitleMatched,
      scoreDelta,
      overallScoreDelta
    }
  };
}
function resolveImprovementValidationStatus(validation) {
  var _a;
  const status = (_a = validation == null ? void 0 : validation.jobAlignment) == null ? void 0 : _a.status;
  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();
    if (["passed", "failed", "skipped", "unknown"].includes(normalized)) {
      return normalized;
    }
  }
  return "unknown";
}
function improvementValidationPassed(validation) {
  const status = resolveImprovementValidationStatus(validation);
  return status === "passed" || status === "skipped";
}
function formatReadableList(items) {
  const list = toUniqueList(Array.isArray(items) ? items : [items]);
  if (!list.length)
    return "";
  if (list.length === 1)
    return list[0];
  if (list.length === 2)
    return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}
function normalizeSegmentText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "";
  }
  if (value === null || value === void 0) {
    return "";
  }
  return String(value || "").trim();
}
function normalizeSegmentList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSegmentText(entry)).filter(Boolean);
  }
  const text = normalizeSegmentText(value);
  return text ? [text] : [];
}
function formatCertificateDisplay(value) {
  if (!value && value !== 0) {
    return "";
  }
  if (typeof value === "string") {
    return normalizeSegmentText(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "object") {
    const name = normalizeSegmentText(value.name || value.title);
    const provider = normalizeSegmentText(
      value.provider || value.issuer || value.organization || value.organisation
    );
    const combined = [name, provider].filter(Boolean).join(" — ");
    return combined || name || provider;
  }
  return "";
}
function buildSummarySegmentSignature(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return "";
  }
  const normalized = segments.map((segment) => ({
    section: normalizeSegmentText((segment == null ? void 0 : segment.section) || (segment == null ? void 0 : segment.label) || (segment == null ? void 0 : segment.key)),
    added: normalizeSegmentList(segment == null ? void 0 : segment.added),
    removed: normalizeSegmentList(segment == null ? void 0 : segment.removed),
    reason: normalizeSegmentList(segment == null ? void 0 : segment.reason)
  }));
  return JSON.stringify(normalized);
}
const COVER_LETTER_TYPES = /* @__PURE__ */ new Set(["cover_letter1", "cover_letter2"]);
function isCoverLetterType(type) {
  return COVER_LETTER_TYPES.has(type);
}
function extractCoverLetterRawText(input) {
  if (!input)
    return "";
  if (typeof input === "string")
    return input;
  if (typeof input === "object") {
    if (typeof input.raw === "string")
      return input.raw;
    if (Array.isArray(input.paragraphs) && input.paragraphs.length) {
      return input.paragraphs.join("\n\n");
    }
  }
  return "";
}
function getCoverLetterTextFromFile(file) {
  if (!file || typeof file !== "object")
    return "";
  return extractCoverLetterRawText(file.text);
}
function resolveCoverLetterDraftText(drafts, originals, type, file) {
  if (!isCoverLetterType(type))
    return "";
  if (drafts && Object.prototype.hasOwnProperty.call(drafts, type)) {
    const draftValue = drafts[type];
    return typeof draftValue === "string" ? draftValue : "";
  }
  const originalValue = originals && typeof originals[type] === "string" ? originals[type] : "";
  if (originalValue) {
    return originalValue;
  }
  return getCoverLetterTextFromFile(file);
}
function getBaselineScoreFromMatch(matchData) {
  if (!matchData || typeof matchData !== "object")
    return null;
  const { atsScoreAfter, enhancedScore, atsScoreBefore, originalScore } = matchData;
  if (Number.isFinite(atsScoreAfter))
    return atsScoreAfter;
  if (Number.isFinite(enhancedScore))
    return enhancedScore;
  if (Number.isFinite(atsScoreBefore))
    return atsScoreBefore;
  if (Number.isFinite(originalScore))
    return originalScore;
  return null;
}
function deriveCoverLetterStateFromFiles(files) {
  const drafts = {};
  const originals = {};
  if (!Array.isArray(files)) {
    return { drafts, originals };
  }
  files.forEach((file) => {
    if (!file || typeof file !== "object")
      return;
    const type = file.type;
    if (!isCoverLetterType(type))
      return;
    const text = getCoverLetterTextFromFile(file);
    drafts[type] = text;
    originals[type] = text;
  });
  return { drafts, originals };
}
function getDownloadStateKey(file = {}) {
  const type = typeof file.type === "string" ? file.type.trim() : "";
  if (type)
    return type;
  const url = typeof file.url === "string" ? file.url.trim() : "";
  return url;
}
function extractFileNameFromDisposition(header) {
  if (!header || typeof header !== "string")
    return "";
  const utf8Match = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    const rawValue = utf8Match[1].trim().replace(/^['"]|['"]$/g, "");
    try {
      const decoded = decodeURIComponent(rawValue);
      if (decoded)
        return decoded;
    } catch (err) {
      return rawValue;
    }
    return rawValue;
  }
  const asciiMatch = header.match(/filename="?([^";]+)"?/i);
  if (asciiMatch && asciiMatch[1]) {
    return asciiMatch[1].trim();
  }
  return "";
}
function extractFileNameFromUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== "string")
    return "";
  try {
    const parsed = new URL(downloadUrl);
    const pathname = parsed.pathname || "";
    const segments = pathname.split("/");
    while (segments.length && !segments[segments.length - 1]) {
      segments.pop();
    }
    const candidate = segments.pop() || "";
    return candidate ? decodeURIComponent(candidate) : "";
  } catch (err) {
    const sanitized = downloadUrl.split("?")[0];
    const parts = sanitized.split("/");
    const candidate = parts.pop() || parts.pop() || "";
    return candidate || "";
  }
}
function extractFileExtension(source) {
  if (!source || typeof source !== "string") {
    return "";
  }
  const sanitized = source.trim();
  if (!sanitized) {
    return "";
  }
  const withoutQuery = sanitized.split("?")[0];
  const withoutHash = withoutQuery.split("#")[0];
  const lastDot = withoutHash.lastIndexOf(".");
  if (lastDot === -1 || lastDot === withoutHash.length - 1) {
    return "";
  }
  return withoutHash.slice(lastDot).toLowerCase();
}
function isSameOriginUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== "string")
    return false;
  try {
    const parsed = new URL(downloadUrl, typeof window !== "undefined" ? window.location.href : void 0);
    if (typeof window === "undefined" || !(window == null ? void 0 : window.location)) {
      return false;
    }
    return parsed.origin === window.location.origin;
  } catch (err) {
    return false;
  }
}
function openUrlInNewTab(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== "string")
    return false;
  try {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    try {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return true;
    } catch (openErr) {
      console.warn("Failed to open download URL in a new tab", openErr);
      return false;
    }
  }
}
function sanitizeFileNameSegment(segment) {
  if (!segment || typeof segment !== "string") {
    return "document";
  }
  const normalized = segment.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "document";
}
function formatDownloadTimestampLabel(timestamp) {
  if (!timestamp)
    return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()))
    return "";
  return date.toLocaleString(void 0, { dateStyle: "medium", timeStyle: "short" });
}
function normalizeIsoTimestamp(timestamp) {
  if (!timestamp)
    return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()))
    return "";
  return date.toISOString();
}
function extractSessionLabelFromStorageKey(storageKey) {
  if (!storageKey || typeof storageKey !== "string") {
    return "";
  }
  const segments = storageKey.split("/").filter(Boolean);
  if (segments.length < 3) {
    return "";
  }
  const sessionSegments = segments.slice(2);
  const explicitSession = sessionSegments.find(
    (segment) => /^session[-_]/i.test(segment)
  );
  if (explicitSession) {
    return explicitSession;
  }
  const [firstSegment = "", secondSegment = ""] = sessionSegments;
  const dateMatch = firstSegment.match(/^([0-9]{4})([0-9]{2})([0-9]{2})$/);
  if (dateMatch) {
    const formattedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    return secondSegment ? `${formattedDate}/${secondSegment}` : formattedDate;
  }
  if (secondSegment) {
    return `${firstSegment}/${secondSegment}`;
  }
  return firstSegment;
}
function buildTimestampSlug(timestamp) {
  if (!timestamp)
    return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()))
    return "";
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}${month}${day}-${hours}${minutes}`;
}
function deriveDownloadFileName(file, presentation = {}, response, options = {}) {
  var _a, _b, _c, _d, _e;
  const disposition = ((_b = (_a = response == null ? void 0 : response.headers) == null ? void 0 : _a.get) == null ? void 0 : _b.call(_a, "content-disposition")) || "";
  const dispositionName = extractFileNameFromDisposition(disposition);
  if (dispositionName) {
    return dispositionName;
  }
  const urlName = extractFileNameFromUrl(file == null ? void 0 : file.url);
  if (urlName) {
    return urlName;
  }
  const baseSource = typeof (file == null ? void 0 : file.fileName) === "string" && file.fileName.trim() || typeof (presentation == null ? void 0 : presentation.label) === "string" && presentation.label.trim() || typeof (file == null ? void 0 : file.type) === "string" && file.type.trim() || "document";
  const base = sanitizeFileNameSegment(baseSource);
  const templateSegmentRaw = typeof (options == null ? void 0 : options.templateName) === "string" && options.templateName.trim() || typeof (options == null ? void 0 : options.templateId) === "string" && options.templateId.trim() || "";
  const templateSegment = templateSegmentRaw ? sanitizeFileNameSegment(templateSegmentRaw) : "";
  const timestampInput = (options == null ? void 0 : options.timestamp) || (options == null ? void 0 : options.generatedAt) || Date.now();
  const timestampSegment = buildTimestampSlug(timestampInput);
  const versionSegmentRaw = typeof (options == null ? void 0 : options.versionId) === "string" && options.versionId.trim() || typeof (file == null ? void 0 : file.versionId) === "string" && file.versionId.trim() || "";
  const versionSegment = versionSegmentRaw ? sanitizeFileNameSegment(versionSegmentRaw).slice(0, 40) : "";
  const hashSegmentRaw = typeof (options == null ? void 0 : options.versionHash) === "string" && options.versionHash.trim() || typeof (file == null ? void 0 : file.versionHash) === "string" && file.versionHash.trim() || "";
  const hashSegment = !versionSegment && hashSegmentRaw ? sanitizeFileNameSegment(hashSegmentRaw.slice(0, 12)) : "";
  const segments = [base];
  if (templateSegment && !segments.includes(templateSegment)) {
    segments.push(templateSegment);
  }
  if (timestampSegment && !segments.includes(timestampSegment)) {
    segments.push(timestampSegment);
  }
  if (versionSegment && !segments.includes(versionSegment)) {
    segments.push(versionSegment);
  } else if (hashSegment && !segments.includes(hashSegment)) {
    segments.push(hashSegment);
  }
  const overrideType = typeof (options == null ? void 0 : options.contentTypeOverride) === "string" && options.contentTypeOverride.trim() || "";
  const headerContentType = ((_d = (_c = response == null ? void 0 : response.headers) == null ? void 0 : _c.get) == null ? void 0 : _d.call(_c, "content-type")) || "";
  const contentType = overrideType || headerContentType;
  const normalizedType = (_e = contentType.split(";")[0]) == null ? void 0 : _e.trim().toLowerCase();
  let extension = ".pdf";
  if (!(options == null ? void 0 : options.forcePdfExtension) && normalizedType) {
    if (normalizedType.includes("pdf")) {
      extension = ".pdf";
    } else if (normalizedType.includes("wordprocessingml")) {
      extension = ".docx";
    } else if (normalizedType.includes("msword")) {
      extension = ".doc";
    } else if (normalizedType === "application/json") {
      extension = ".json";
    }
  }
  return `${segments.filter(Boolean).join("-")}${extension}`;
}
function buildActionableHint(segment) {
  return buildImprovementHintFromSegment(segment);
}
const TEMPLATE_PREFERENCE_STORAGE_KEY = "resumeForge.templatePreferences";
const USER_ID_STORAGE_KEY = "resumeForge.userId";
function readTemplatePreferenceStore() {
  if (typeof window === "undefined" || !(window == null ? void 0 : window.localStorage)) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(TEMPLATE_PREFERENCE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.warn("Failed to read template preference store", err);
    return {};
  }
}
function writeTemplatePreferenceStore(store) {
  if (typeof window === "undefined" || !(window == null ? void 0 : window.localStorage)) {
    return;
  }
  try {
    window.localStorage.setItem(
      TEMPLATE_PREFERENCE_STORAGE_KEY,
      JSON.stringify(store || {})
    );
  } catch (err) {
    console.warn("Failed to persist template preference store", err);
  }
}
function getStoredTemplatePreference(userIdentifier) {
  if (!userIdentifier) {
    return "";
  }
  const store = readTemplatePreferenceStore();
  const entry = store[userIdentifier];
  if (!entry) {
    return "";
  }
  if (typeof entry === "string") {
    return entry;
  }
  if (entry && typeof entry === "object") {
    return typeof entry.template === "string" ? entry.template : "";
  }
  return "";
}
function setStoredTemplatePreference(userIdentifier, templateId) {
  if (!userIdentifier || typeof templateId !== "string" || !templateId.trim()) {
    return;
  }
  const store = readTemplatePreferenceStore();
  const normalizedTemplate = templateId.trim();
  const existing = store[userIdentifier];
  if (typeof existing === "string" && existing === normalizedTemplate || existing && typeof existing === "object" && existing.template === normalizedTemplate) {
    return;
  }
  store[userIdentifier] = {
    template: normalizedTemplate,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeTemplatePreferenceStore(store);
}
function generateUserIdentifier() {
  var _a;
  try {
    if (typeof globalThis !== "undefined" && ((_a = globalThis.crypto) == null ? void 0 : _a.randomUUID)) {
      return globalThis.crypto.randomUUID();
    }
  } catch (err) {
    console.warn("Failed to generate UUID via crypto", err);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function readStoredUserId() {
  if (typeof window === "undefined" || !(window == null ? void 0 : window.localStorage)) {
    return "";
  }
  try {
    const raw = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  } catch (err) {
    console.warn("Failed to read stored user id", err);
  }
  return "";
}
function persistStoredUserId(userId) {
  if (typeof window === "undefined" || !(window == null ? void 0 : window.localStorage) || !userId) {
    return;
  }
  try {
    window.localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  } catch (err) {
    console.warn("Failed to persist user id", err);
  }
}
function getOrCreateUserId() {
  const stored = readStoredUserId();
  if (stored) {
    return stored;
  }
  const generated = generateUserIdentifier();
  persistStoredUserId(generated);
  return generated;
}
function canonicalizeProfileIdentifier(profileUrl) {
  if (typeof profileUrl !== "string") {
    return "";
  }
  const trimmed = profileUrl.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const hasScheme = /^[a-z][a-z\d+\-.]*:/i.test(trimmed);
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    url.hash = "";
    url.search = "";
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    let path = url.pathname.replace(/\s+/g, "").replace(/\/+/g, "/");
    if (path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    if (!path || path === "/") {
      return host;
    }
    return `${host}${path.toLowerCase()}`;
  } catch {
    return trimmed.toLowerCase();
  }
}
const PROHIBITED_JOB_DESCRIPTION_TAGS = Object.freeze([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "meta",
  "link",
  "base",
  "form",
  "input",
  "button",
  "textarea"
]);
function looksLikeJobDescriptionUrl(text) {
  if (typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (/\s/.test(trimmed)) {
    return false;
  }
  const urlPattern = /^(?:https?:\/\/|ftp:\/\/|www\.)\S+$/i;
  if (urlPattern.test(trimmed)) {
    return true;
  }
  const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/\S*)?$/i;
  return domainPattern.test(trimmed);
}
function containsProhibitedJobDescriptionHtml(text) {
  if (typeof text !== "string") {
    return false;
  }
  const normalized = text.replace(/\u0000/g, "");
  return PROHIBITED_JOB_DESCRIPTION_TAGS.some((tag) => {
    const pattern = new RegExp(`<\\/?${tag}(?=\b|[s>/])`, "i");
    return pattern.test(normalized);
  });
}
function deriveUserIdentifier({ profileUrl, userId } = {}) {
  const explicitId = typeof userId === "string" ? userId.trim() : "";
  if (explicitId) {
    return explicitId.toLowerCase();
  }
  return canonicalizeProfileIdentifier(profileUrl);
}
function formatEnhanceAllSummary(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return "";
  }
  const segments = entries.map((entry) => {
    if (!entry)
      return "";
    const sectionLabel = (entry.section || entry.label || entry.key || "").trim() || "Update";
    const added = summariseItems(entry.added, { limit: 4 });
    const removed = summariseItems(entry.removed, { limit: 4 });
    const reasonLines = Array.isArray(entry.reason) ? entry.reason.filter(Boolean) : typeof entry.reason === "string" && entry.reason.trim() ? [entry.reason.trim()] : [];
    const reasonText = reasonLines.join(" ");
    const detailParts = [
      reasonText,
      added ? `Added ${added}.` : "",
      removed ? `Removed ${removed}.` : ""
    ].map((part) => part.trim()).filter(Boolean);
    const detailText = detailParts.join(" ");
    return `${sectionLabel}: ${detailText || "Updated to align with the JD."}`;
  }).filter(Boolean);
  return segments.join(" · ");
}
const highlightToneStyles = {
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  info: "bg-sky-50 border-sky-200 text-sky-800"
};
function formatStatusLabel(status) {
  if (!status)
    return "";
  const normalized = String(status).replace(/[-_]/g, " ").trim();
  if (!normalized)
    return "";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}
const jobFitToneStyles = {
  match: {
    container: "bg-emerald-50 border-emerald-200 text-emerald-800",
    bar: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700",
    scoreText: "text-emerald-700"
  },
  success: {
    container: "bg-emerald-50 border-emerald-200 text-emerald-800",
    bar: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700",
    scoreText: "text-emerald-700"
  },
  partial: {
    container: "bg-amber-50 border-amber-200 text-amber-800",
    bar: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700",
    scoreText: "text-amber-700"
  },
  info: {
    container: "bg-sky-50 border-sky-200 text-sky-800",
    bar: "bg-sky-500",
    chip: "bg-sky-500/10 text-sky-700",
    scoreText: "text-sky-700"
  },
  gap: {
    container: "bg-amber-50 border-amber-200 text-amber-800",
    bar: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700",
    scoreText: "text-amber-700"
  },
  warning: {
    container: "bg-amber-50 border-amber-200 text-amber-800",
    bar: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700",
    scoreText: "text-amber-700"
  },
  mismatch: {
    container: "bg-amber-50 border-amber-200 text-amber-800",
    bar: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700",
    scoreText: "text-amber-700"
  },
  unknown: {
    container: "bg-slate-50 border-slate-200 text-slate-700",
    bar: "bg-slate-400",
    chip: "bg-slate-400/20 text-slate-600",
    scoreText: "text-slate-700"
  },
  default: {
    container: "bg-slate-50 border-slate-200 text-slate-700",
    bar: "bg-slate-400",
    chip: "bg-slate-400/20 text-slate-600",
    scoreText: "text-slate-700"
  }
};
const COVER_TEMPLATE_IDS = [
  "cover_modern",
  "cover_classic",
  "cover_professional",
  "cover_ats",
  "cover_2025"
];
const COVER_TEMPLATE_ALIASES = {
  modern: "cover_modern",
  classic: "cover_classic",
  professional: "cover_professional",
  ats: "cover_ats",
  "2025": "cover_2025",
  futuristic: "cover_2025",
  "cover-modern": "cover_modern",
  "cover-classic": "cover_classic",
  "cover-professional": "cover_professional",
  "cover-ats": "cover_ats",
  "cover-2025": "cover_2025",
  "modern-cover": "cover_modern",
  "classic-cover": "cover_classic",
  "professional-cover": "cover_professional",
  "ats-cover": "cover_ats",
  "2025-cover": "cover_2025",
  "cover modern": "cover_modern",
  "cover classic": "cover_classic",
  "cover professional": "cover_professional",
  "cover ats": "cover_ats",
  "cover 2025": "cover_2025",
  covermodern: "cover_modern",
  coverclassic: "cover_classic",
  coverprofessional: "cover_professional",
  coverats: "cover_ats",
  cover2025: "cover_2025",
  covermidnight: "cover_classic"
};
const RESUME_TO_COVER_TEMPLATE = {
  modern: "cover_modern",
  professional: "cover_professional",
  classic: "cover_classic",
  ats: "cover_ats",
  2025: "cover_2025"
};
const DEFAULT_COVER_TEMPLATE = "cover_modern";
const canonicalizeCoverTemplateId = (value, fallback = "") => {
  if (typeof value !== "string")
    return fallback;
  const trimmed = value.trim();
  if (!trimmed)
    return fallback;
  const lowerTrimmed = trimmed.toLowerCase();
  if (COVER_TEMPLATE_IDS.includes(lowerTrimmed))
    return lowerTrimmed;
  const normalized = lowerTrimmed.replace(/\s+/g, "_");
  if (COVER_TEMPLATE_IDS.includes(normalized)) {
    return normalized;
  }
  const alias = COVER_TEMPLATE_ALIASES[normalized] || COVER_TEMPLATE_ALIASES[lowerTrimmed];
  if (alias)
    return alias;
  if (normalized.includes("classic"))
    return "cover_classic";
  if (normalized.includes("modern"))
    return "cover_modern";
  if (normalized.includes("professional"))
    return "cover_professional";
  if (normalized.includes("2025"))
    return "cover_2025";
  if (normalized.includes("ats"))
    return "cover_ats";
  return fallback;
};
const normalizeCoverTemplateList = (list = []) => {
  if (!Array.isArray(list))
    return [];
  return Array.from(
    new Set(list.map((item) => canonicalizeCoverTemplateId(item)).filter(Boolean))
  );
};
const deriveCoverTemplateFromResume = (templateId) => {
  const canonical = canonicalizeTemplateId(templateId);
  if (!canonical)
    return DEFAULT_COVER_TEMPLATE;
  if (RESUME_TO_COVER_TEMPLATE[canonical]) {
    return RESUME_TO_COVER_TEMPLATE[canonical];
  }
  return DEFAULT_COVER_TEMPLATE;
};
const ensureCoverTemplateContext = (context, templateId, { linkCoverToResume } = {}) => {
  const derived = deriveCoverTemplateFromResume(templateId || DEFAULT_COVER_TEMPLATE);
  const base = context ? { ...context } : {};
  const requestedLink = typeof linkCoverToResume === "boolean" ? linkCoverToResume : base.coverTemplateLinkedToResume !== false;
  let coverTemplate1 = canonicalizeCoverTemplateId(base.coverTemplate1);
  if (requestedLink || !coverTemplate1) {
    coverTemplate1 = derived;
  }
  const coverTemplates = normalizeCoverTemplateList(base.coverTemplates);
  const coverTemplate2 = canonicalizeCoverTemplateId(base.coverTemplate2);
  const mergedTemplates = normalizeCoverTemplateList([
    coverTemplate1,
    derived,
    coverTemplate2,
    ...coverTemplates
  ]);
  if (!mergedTemplates.length) {
    mergedTemplates.push(DEFAULT_COVER_TEMPLATE);
  }
  if (!mergedTemplates.includes(derived)) {
    mergedTemplates.unshift(derived);
  }
  const fallback = mergedTemplates.find((tpl) => tpl !== coverTemplate1) || COVER_TEMPLATE_IDS.find((tpl) => tpl !== coverTemplate1) || DEFAULT_COVER_TEMPLATE;
  base.coverTemplates = mergedTemplates;
  base.coverTemplate1 = coverTemplate1;
  if (!coverTemplate2 || coverTemplate2 === coverTemplate1) {
    base.coverTemplate2 = fallback;
  } else {
    base.coverTemplate2 = coverTemplate2;
  }
  base.coverTemplateLinkedToResume = requestedLink;
  return base;
};
const buildResumeTemplateMetadata = (templateId) => {
  const canonical = canonicalizeTemplateId(templateId);
  if (!canonical)
    return null;
  const templateName = formatTemplateName(canonical);
  const templateLabel = templateName ? `${templateName} Resume` : "Resume Template";
  return {
    templateId: canonical,
    templateName,
    templateType: "resume",
    templateLabel
  };
};
const buildCoverTemplateMetadata = (templateId) => {
  const canonical = canonicalizeCoverTemplateId(templateId);
  if (!canonical)
    return null;
  const templateName = formatCoverTemplateName(canonical);
  const templateLabel = templateName || "Cover Letter";
  return {
    templateId: canonical,
    templateName,
    templateType: "cover",
    templateLabel
  };
};
const decorateTemplateContext = (context) => {
  if (!context || typeof context !== "object")
    return context;
  const canonicalPrimary = canonicalizeTemplateId(context.template1);
  const canonicalSecondary = canonicalizeTemplateId(context.template2);
  const canonicalSelected = canonicalizeTemplateId(context.selectedTemplate) || canonicalPrimary || canonicalSecondary || "";
  const canonicalCoverPrimary = canonicalizeCoverTemplateId(context.coverTemplate1);
  const canonicalCoverSecondary = canonicalizeCoverTemplateId(context.coverTemplate2);
  const templateMetadata = {
    resume: {
      primary: buildResumeTemplateMetadata(canonicalPrimary),
      secondary: buildResumeTemplateMetadata(canonicalSecondary),
      selected: buildResumeTemplateMetadata(canonicalSelected)
    },
    cover: {
      primary: buildCoverTemplateMetadata(canonicalCoverPrimary),
      secondary: buildCoverTemplateMetadata(canonicalCoverSecondary)
    }
  };
  return { ...context, templateMetadata };
};
const normalizeTemplateContext = (context) => {
  if (!context || typeof context !== "object")
    return null;
  const normalized = { ...context };
  const primary = canonicalizeTemplateId(context.template1);
  const secondary = canonicalizeTemplateId(context.template2);
  const selected = canonicalizeTemplateId(context.selectedTemplate) || primary || secondary;
  if (primary)
    normalized.template1 = primary;
  if (secondary)
    normalized.template2 = secondary;
  if (selected)
    normalized.selectedTemplate = selected;
  const historyList = [];
  if (Array.isArray(context.templateHistory)) {
    context.templateHistory.forEach((item) => {
      const canonical = canonicalizeTemplateId(item);
      if (canonical && !historyList.includes(canonical)) {
        historyList.push(canonical);
      }
    });
  }
  const ensureHistory = (value) => {
    const canonical = canonicalizeTemplateId(value);
    if (!canonical)
      return;
    const index2 = historyList.indexOf(canonical);
    if (index2 >= 0) {
      historyList.splice(index2, 1);
    }
    historyList.unshift(canonical);
  };
  ensureHistory(selected);
  ensureHistory(primary);
  ensureHistory(secondary);
  if (historyList.length) {
    normalized.templateHistory = historyList;
  } else if ("templateHistory" in normalized) {
    delete normalized.templateHistory;
  }
  if (Array.isArray(context.templates)) {
    normalized.templates = Array.from(
      new Set(
        context.templates.map((item) => canonicalizeTemplateId(item)).filter(Boolean)
      )
    );
  }
  const baseTemplates = Array.isArray(normalized.templates) ? normalized.templates : [];
  const enrichedTemplates = Array.from(
    new Set([primary, selected, secondary, ...baseTemplates].filter(Boolean))
  );
  if (enrichedTemplates.length) {
    normalized.templates = Array.from(
      /* @__PURE__ */ new Set(["modern", ...enrichedTemplates.filter(Boolean)])
    );
  }
  const templateForCover = normalized.selectedTemplate || normalized.template1 || "modern";
  const shouldLinkCover = normalized.coverTemplateLinkedToResume !== false;
  const contextWithCover = ensureCoverTemplateContext(normalized, templateForCover, {
    linkCoverToResume: shouldLinkCover
  });
  return decorateTemplateContext(contextWithCover);
};
const buildTemplateRequestContext = (templateContext, selectedTemplate) => {
  const canonicalSelectedTemplate = canonicalizeTemplateId(selectedTemplate) || "modern";
  const baseContext = templateContext && typeof templateContext === "object" ? { ...templateContext } : {};
  if (!baseContext.template1) {
    baseContext.template1 = canonicalSelectedTemplate;
  }
  if (!baseContext.selectedTemplate) {
    baseContext.selectedTemplate = canonicalSelectedTemplate;
  }
  const normalizedContext = normalizeTemplateContext(baseContext) || {
    template1: canonicalSelectedTemplate,
    template2: canonicalSelectedTemplate,
    selectedTemplate: canonicalSelectedTemplate
  };
  const canonicalPrimaryTemplate = canonicalizeTemplateId(normalizedContext.template1) || canonicalSelectedTemplate;
  const canonicalSecondaryTemplate = canonicalizeTemplateId(normalizedContext.template2) || canonicalPrimaryTemplate;
  const canonicalTemplate = canonicalizeTemplateId(normalizedContext.selectedTemplate) || canonicalPrimaryTemplate;
  const derivedCoverTemplate = deriveCoverTemplateFromResume(canonicalTemplate);
  const canonicalCoverPrimaryTemplate = canonicalizeCoverTemplateId(
    normalizedContext.coverTemplate1,
    canonicalizeCoverTemplateId(derivedCoverTemplate, DEFAULT_COVER_TEMPLATE)
  ) || DEFAULT_COVER_TEMPLATE;
  let canonicalCoverSecondaryTemplate = canonicalizeCoverTemplateId(
    normalizedContext.coverTemplate2,
    canonicalCoverPrimaryTemplate
  );
  const coverTemplateCandidatesRaw = Array.isArray(normalizedContext.coverTemplates) ? normalizedContext.coverTemplates : [];
  const canonicalCoverTemplateCandidates = coverTemplateCandidatesRaw.map((item) => canonicalizeCoverTemplateId(item)).filter(Boolean);
  if (!canonicalCoverSecondaryTemplate || canonicalCoverSecondaryTemplate === canonicalCoverPrimaryTemplate) {
    const fallbackCandidate = canonicalCoverTemplateCandidates.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) || COVER_TEMPLATE_IDS.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) || canonicalCoverPrimaryTemplate;
    canonicalCoverSecondaryTemplate = fallbackCandidate;
  }
  const canonicalCoverTemplate = canonicalCoverPrimaryTemplate || DEFAULT_COVER_TEMPLATE;
  const templateCandidatesRaw = Array.isArray(normalizedContext.templates) ? normalizedContext.templates : [];
  const canonicalTemplateCandidates = templateCandidatesRaw.map((item) => canonicalizeTemplateId(item)).filter(Boolean);
  const canonicalTemplateList = Array.from(
    new Set(
      [
        canonicalTemplate,
        canonicalPrimaryTemplate,
        canonicalSecondaryTemplate,
        ...canonicalTemplateCandidates
      ].filter(Boolean)
    )
  );
  const canonicalCoverTemplateList = Array.from(
    new Set(
      [
        canonicalCoverPrimaryTemplate,
        canonicalCoverSecondaryTemplate,
        ...canonicalCoverTemplateCandidates
      ].filter(Boolean)
    )
  );
  const preparedContext = {
    ...normalizedContext,
    template1: canonicalPrimaryTemplate,
    template2: canonicalSecondaryTemplate,
    selectedTemplate: canonicalTemplate,
    templates: canonicalTemplateList,
    coverTemplate1: canonicalCoverPrimaryTemplate,
    coverTemplate2: canonicalCoverSecondaryTemplate,
    coverTemplates: canonicalCoverTemplateList
  };
  return {
    canonicalTemplate,
    canonicalPrimaryTemplate,
    canonicalSecondaryTemplate,
    canonicalCoverTemplate,
    canonicalCoverPrimaryTemplate,
    canonicalCoverSecondaryTemplate,
    canonicalTemplateList,
    canonicalCoverTemplateList,
    context: preparedContext
  };
};
const formatTemplateName = (id2) => {
  if (!id2)
    return "Custom Template";
  const raw = typeof id2 === "string" ? id2.trim() : String(id2 || "").trim();
  if (!raw)
    return "Custom Template";
  const canonical = canonicalizeTemplateId(raw);
  if (canonical && TEMPLATE_DISPLAY_NAME_MAP.has(canonical)) {
    return TEMPLATE_DISPLAY_NAME_MAP.get(canonical);
  }
  const lower = raw.toLowerCase();
  if (TEMPLATE_DISPLAY_NAME_MAP.has(lower)) {
    return TEMPLATE_DISPLAY_NAME_MAP.get(lower);
  }
  const normalized = canonical || raw;
  return normalized.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
};
const COVER_TEMPLATE_DETAILS = {
  cover_modern: {
    name: "Modern Cover Letter",
    description: "Gradient header with confident typography and clean paragraph rhythm."
  },
  cover_classic: {
    name: "Classic Cover Letter",
    description: "Elegant serif presentation with letterhead-inspired spacing and signature close."
  },
  cover_professional: {
    name: "Professional Cover Letter",
    description: "Boardroom-ready styling with navy accents and structured paragraph spacing."
  },
  cover_ats: {
    name: "ATS Cover Letter",
    description: "Single-column focus with neutral tones engineered for parsing clarity."
  },
  cover_2025: {
    name: "Future Vision 2025 Cover Letter",
    description: "Futuristic layout with dark canvas, neon accents, and confident typography."
  }
};
const COVER_TEMPLATE_ORDER = [
  "cover_modern",
  "cover_classic",
  "cover_professional",
  "cover_ats",
  "cover_2025"
];
const COVER_TEMPLATE_OPTIONS = COVER_TEMPLATE_ORDER.filter((id2) => COVER_TEMPLATE_DETAILS[id2]).map(
  (id2) => ({
    id: id2,
    name: COVER_TEMPLATE_DETAILS[id2].name,
    description: COVER_TEMPLATE_DETAILS[id2].description
  })
);
const formatCoverTemplateName = (id2) => {
  var _a;
  if (!id2)
    return "Cover Letter";
  return ((_a = COVER_TEMPLATE_DETAILS[id2]) == null ? void 0 : _a.name) || "Cover Letter";
};
const getCoverTemplateDescription = (id2) => {
  var _a;
  if (!id2)
    return "";
  return ((_a = COVER_TEMPLATE_DETAILS[id2]) == null ? void 0 : _a.description) || "";
};
const resolveCoverTemplateSelection = ({
  file = {},
  type = "",
  downloadTemplateMetadata = {},
  templateContext = {}
} = {}) => {
  const metadataForType = (downloadTemplateMetadata && typeof downloadTemplateMetadata === "object" ? downloadTemplateMetadata[type] : null) || {};
  const fileTemplateMeta = (file.templateMeta && typeof file.templateMeta === "object" ? file.templateMeta : null) || metadataForType || {};
  const context = templateContext && typeof templateContext === "object" ? templateContext : {};
  const resolvedTemplateId = canonicalizeCoverTemplateId(
    fileTemplateMeta.templateId || file.templateId || file.coverTemplateId || (metadataForType == null ? void 0 : metadataForType.id) || context.coverTemplate1 || DEFAULT_COVER_TEMPLATE,
    DEFAULT_COVER_TEMPLATE
  );
  const resolvedTemplateName = typeof fileTemplateMeta.templateName === "string" && fileTemplateMeta.templateName.trim() || typeof file.coverTemplateName === "string" && file.coverTemplateName.trim() || typeof (metadataForType == null ? void 0 : metadataForType.name) === "string" && metadataForType.name.trim() || formatCoverTemplateName(resolvedTemplateId);
  const coverTemplateCandidates = normalizeCoverTemplateList([
    resolvedTemplateId,
    fileTemplateMeta.templateId,
    file.coverTemplateId,
    metadataForType == null ? void 0 : metadataForType.id,
    context.coverTemplate1,
    context.coverTemplate2,
    ...Array.isArray(context.coverTemplates) ? context.coverTemplates : []
  ]);
  return {
    templateId: resolvedTemplateId,
    templateName: resolvedTemplateName,
    templateMeta: fileTemplateMeta,
    candidates: coverTemplateCandidates
  };
};
const ATS_SUB_SCORE_ORDER = [
  "Layout & Searchability",
  "Readability",
  "Impact",
  "Crispness",
  "Other"
];
const CHANGE_TYPE_LABELS = {
  added: "Added",
  fixed: "Fixed",
  rephrased: "Rephrased",
  removed: "Removed"
};
const changeLabelStyles = {
  added: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  fixed: "bg-sky-100 text-sky-700 border border-sky-200",
  rephrased: "bg-indigo-100 text-indigo-700 border border-indigo-200",
  removed: "bg-rose-100 text-rose-700 border border-rose-200"
};
const DEFAULT_ITEM_REASON_BY_CHANGE_TYPE = {
  added: "Added to meet JD skill coverage.",
  replaced: "Replaced to highlight required for role.",
  removed: "Removed to keep the story aligned with the target role.",
  default: "Updated to strengthen alignment with the JD."
};
const ITEM_REASON_HINTS_BY_SUGGESTION = {
  "improve-summary": {
    added: "Added to mirror JD tone and value focus.",
    replaced: "Rephrased to highlight required for role messaging.",
    removed: "Removed to keep the opener laser-focused on the JD."
  },
  "add-missing-skills": {
    added: "Added to meet JD skill requirement captured in the posting.",
    removed: "Removed duplicate skill so ATS highlights the JD keywords."
  },
  "align-experience": {
    added: "Added to spotlight accomplishments the JD emphasises.",
    replaced: "Reworded to highlight required for role outcomes.",
    removed: "Removed lower-impact detail to surface role-critical wins."
  },
  "change-designation": {
    added: "Added to match the target job title flagged in the JD.",
    replaced: "Updated title to highlight required designation for the role.",
    removed: "Removed conflicting title to avoid ATS mismatches."
  },
  "improve-certifications": {
    added: "Added to surface certifications the JD calls out.",
    replaced: "Reordered credentials to highlight required certification.",
    removed: "Removed redundant certification so the must-have stands out."
  },
  "improve-projects": {
    added: "Added to prove project impact tied to the JD expectations.",
    replaced: "Reframed outcome to highlight required for role success.",
    removed: "Removed side project to emphasise the JD-aligned win."
  },
  "improve-highlights": {
    added: "Added to highlight wins recruiters look for in this role.",
    replaced: "Replaced to spotlight the highlight required for role fit.",
    removed: "Removed weaker highlight so JD-aligned result stands out."
  },
  "enhance-all": {
    added: "Added to align every section with the JD priorities.",
    replaced: "Reworked wording to highlight required for role coverage.",
    removed: "Removed mismatched content to keep the CV JD-focused."
  }
};
const CHANGE_LOG_SECTION_LABELS = {
  summary: "Summary",
  skills: "Skills",
  experience: "Work Experience",
  certifications: "Certifications",
  projects: "Projects",
  highlights: "Highlights",
  designation: "Designation",
  education: "Education",
  resume: "Entire Resume"
};
const CHANGE_LOG_SECTIONS_BY_TYPE = {
  "improve-summary": { key: "summary", label: "Summary" },
  "add-missing-skills": { key: "skills", label: "Skills" },
  "align-experience": { key: "experience", label: "Work Experience" },
  "improve-certifications": { key: "certifications", label: "Certifications" },
  "improve-projects": { key: "projects", label: "Projects" },
  "improve-highlights": { key: "highlights", label: "Highlights" },
  "change-designation": { key: "designation", label: "Designation" },
  "enhance-all": { key: "resume", label: "Entire Resume" }
};
const DOWNLOAD_VARIANT_BADGE_STYLES = {
  original: {
    text: "Original",
    className: "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700"
  },
  enhanced: {
    text: "Enhanced",
    className: "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700"
  }
};
function getDownloadPresentation(file = {}) {
  const type = (file == null ? void 0 : file.type) || "";
  switch (type) {
    case "original_upload":
      return {
        label: "Original CV Upload",
        description: "Exact resume you submitted before any AI enhancements—keep this for applications that prefer the untouched version.",
        badgeText: "Original CV",
        badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
        buttonStyle: "bg-slate-700 hover:bg-slate-800 focus:ring-slate-500",
        cardAccent: "bg-gradient-to-br from-slate-50 via-white to-white",
        cardBorder: "border-slate-200",
        linkLabel: "Download Original CV",
        category: "resume",
        variantType: "original",
        autoPreviewPriority: 4
      };
    case "original_upload_pdf":
      return {
        label: "Original CV (Plain PDF)",
        description: "Text-only PDF fallback generated from your upload. Logos and design elements may be missing—use when you strictly need a PDF copy.",
        badgeText: "Plain PDF",
        badgeStyle: "bg-slate-100 text-slate-600 border-slate-200",
        buttonStyle: "bg-slate-600 hover:bg-slate-700 focus:ring-slate-500",
        cardAccent: "bg-gradient-to-br from-slate-50 via-white to-slate-50",
        cardBorder: "border-slate-200",
        linkLabel: "Download Plain PDF",
        category: "resume",
        variantType: "original",
        autoPreviewPriority: 5
      };
    case "version1":
      return {
        label: "Enhanced CV Version 1",
        description: "Primary rewrite balanced for ATS scoring and recruiter readability with the strongest keyword alignment.",
        badgeText: "Enhanced CV",
        badgeStyle: "bg-emerald-100 text-emerald-700 border-emerald-200",
        buttonStyle: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500",
        cardAccent: "bg-gradient-to-br from-emerald-50 via-white to-white",
        cardBorder: "border-emerald-200",
        linkLabel: "Download Enhanced CV",
        category: "resume",
        variantType: "enhanced",
        autoPreviewPriority: 0
      };
    case "version2":
      return {
        label: "Enhanced CV Version 2",
        description: "Alternate layout that spotlights impact metrics and leadership achievements for different screening preferences.",
        badgeText: "Enhanced CV Alt",
        badgeStyle: "bg-emerald-100 text-emerald-700 border-emerald-200",
        buttonStyle: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500",
        cardAccent: "bg-gradient-to-br from-emerald-50 via-white to-white",
        cardBorder: "border-emerald-200",
        linkLabel: "Download Enhanced CV",
        category: "resume",
        variantType: "enhanced",
        autoPreviewPriority: 1
      };
    case "cover_letter1":
      return {
        label: "Cover Letter 1",
        description: "Tailored opener mirroring the job description tone and top keyword themes.",
        badgeText: "Cover Letter",
        badgeStyle: "bg-indigo-100 text-indigo-700 border-indigo-200",
        buttonStyle: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500",
        cardAccent: "bg-gradient-to-br from-indigo-50 via-white to-white",
        cardBorder: "border-indigo-200",
        linkLabel: "Download Cover Letter",
        category: "cover",
        variantType: "enhanced",
        autoPreviewPriority: 2
      };
    case "cover_letter2":
      return {
        label: "Cover Letter 2",
        description: "Alternate narrative emphasising quantified achievements and culture alignment.",
        badgeText: "Cover Letter",
        badgeStyle: "bg-indigo-100 text-indigo-700 border-indigo-200",
        buttonStyle: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500",
        cardAccent: "bg-gradient-to-br from-indigo-50 via-white to-white",
        cardBorder: "border-indigo-200",
        linkLabel: "Download Cover Letter",
        category: "cover",
        variantType: "enhanced",
        autoPreviewPriority: 3
      };
    default:
      return {
        label: "Generated Document",
        description: "Download the generated document.",
        badgeText: "Download",
        badgeStyle: "bg-purple-100 text-purple-700 border-purple-200",
        buttonStyle: "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500",
        cardAccent: "bg-white/85",
        cardBorder: "border-purple-200",
        linkLabel: "Download File",
        category: "other",
        variantType: "enhanced",
        autoPreviewPriority: 10
      };
  }
}
function deriveChangeLabel(suggestion) {
  const type = (suggestion == null ? void 0 : suggestion.type) || "";
  const before = ((suggestion == null ? void 0 : suggestion.beforeExcerpt) || "").trim();
  const after = ((suggestion == null ? void 0 : suggestion.afterExcerpt) || "").trim();
  if (!before && after)
    return "added";
  if (before && !after)
    return "removed";
  if (before && after && before !== after) {
    if (type === "improve-summary")
      return "rephrased";
    if (type === "change-designation")
      return "fixed";
    if (type === "add-missing-skills" || type === "align-experience" || type === "improve-certifications" || type === "improve-projects" || type === "improve-highlights")
      return "added";
    if (type === "enhance-all")
      return "fixed";
  }
  const fallback = type === "improve-summary" ? "rephrased" : type === "change-designation" ? "fixed" : type === "add-missing-skills" || type === "align-experience" || type === "improve-certifications" || type === "improve-projects" || type === "improve-highlights" ? "added" : "fixed";
  return fallback;
}
function buildChangeLogEntry(suggestion) {
  var _a;
  const label = deriveChangeLabel(suggestion);
  const reason = ((suggestion == null ? void 0 : suggestion.explanation) || "").trim();
  const defaultReasons = {
    "improve-summary": "Reframed your summary so the opener mirrors the job description priorities.",
    "add-missing-skills": "Inserted missing keywords so the CV satisfies the role requirements.",
    "align-experience": "Expanded experience bullets to reflect the selection criteria.",
    "change-designation": "Aligned the visible designation with the target role title.",
    "improve-certifications": "Elevated certifications that validate the role’s compliance or technical focus.",
    "improve-projects": "Reframed project wins to demonstrate alignment with the JD priorities.",
    "improve-highlights": "Tuned top highlights so they emphasise the outcomes hiring managers expect.",
    "enhance-all": "Rolled out combined updates so every section aligns with the JD."
  };
  const baseReason = reason || defaultReasons[suggestion == null ? void 0 : suggestion.type] || "Applied improvement to strengthen alignment.";
  const enhanceAllSummary = (suggestion == null ? void 0 : suggestion.type) === "enhance-all" ? formatEnhanceAllSummary(suggestion == null ? void 0 : suggestion.improvementSummary) : "";
  const selectionNotes = {
    "improve-summary": "Selection focus: mirrors JD tone and value propositions.",
    "add-missing-skills": "Selection focus: surfaces keywords recruiters screen for.",
    "align-experience": "Selection focus: evidences accomplishments tied to job metrics.",
    "change-designation": "Selection focus: resolves designation mismatch flagged in ATS scans.",
    "improve-certifications": "Selection focus: spotlights credentials recruiters validate first.",
    "improve-projects": "Selection focus: proves project impact mirrors hiring goals.",
    "improve-highlights": "Selection focus: amplifies headline wins that catch recruiter attention.",
    "enhance-all": "Selection focus: synchronises every section with the job criteria."
  };
  const selectionDetail = selectionNotes[suggestion == null ? void 0 : suggestion.type];
  const detailText = (() => {
    if ((suggestion == null ? void 0 : suggestion.type) === "enhance-all" && enhanceAllSummary) {
      return `${baseReason} Combined updates — ${enhanceAllSummary}`;
    }
    if (selectionDetail) {
      return `${baseReason} ${selectionDetail}`;
    }
    return baseReason;
  })();
  const summarySegments = Array.isArray(suggestion == null ? void 0 : suggestion.improvementSummary) ? suggestion.improvementSummary.map((segment) => {
    if (!segment)
      return null;
    const sectionLabel = [segment.section, segment.label, segment.key].map((value) => typeof value === "string" ? value.trim() : "").find(Boolean) || "";
    const addedItems2 = Array.isArray(segment.added) ? segment.added.map((item) => typeof item === "string" ? item.trim() : String(item || "").trim()).filter(Boolean) : [];
    const removedItems2 = Array.isArray(segment.removed) ? segment.removed.map((item) => typeof item === "string" ? item.trim() : String(item || "").trim()).filter(Boolean) : [];
    const reasons = Array.isArray(segment.reason) ? segment.reason.map((line) => typeof line === "string" ? line.trim() : "").filter(Boolean) : [];
    if (!sectionLabel && addedItems2.length === 0 && removedItems2.length === 0 && reasons.length === 0) {
      return null;
    }
    return {
      section: sectionLabel,
      added: addedItems2,
      removed: removedItems2,
      reason: reasons
    };
  }).filter(Boolean) : [];
  const normalizeSectionKey = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
      return "";
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  };
  const resolveSectionLabel2 = (key, label2) => {
    const trimmed = typeof label2 === "string" ? label2.trim() : "";
    if (trimmed) {
      return trimmed;
    }
    const keyCandidate = normalizeSectionKey(key);
    if (keyCandidate && CHANGE_LOG_SECTION_LABELS[keyCandidate]) {
      return CHANGE_LOG_SECTION_LABELS[keyCandidate];
    }
    if (keyCandidate) {
      return keyCandidate.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return "";
  };
  const sectionChangeMap = /* @__PURE__ */ new Map();
  const registerSectionChange = (keyCandidate, labelCandidate, weight = 1) => {
    const label2 = resolveSectionLabel2(keyCandidate, labelCandidate);
    const key = normalizeSectionKey(keyCandidate) || normalizeSectionKey(label2);
    if (!key && !label2) {
      return;
    }
    const existing = sectionChangeMap.get(key) || { key, label: label2, count: 0 };
    if (label2 && !existing.label) {
      existing.label = label2;
    }
    const increment = Number.isFinite(weight) && weight > 0 ? weight : 1;
    existing.count += increment;
    if (!existing.label) {
      existing.label = resolveSectionLabel2(key);
    }
    sectionChangeMap.set(key, existing);
  };
  summarySegments.forEach((segment) => {
    if (!segment || !segment.section)
      return;
    registerSectionChange(segment.section, segment.section);
  });
  if (Array.isArray(suggestion == null ? void 0 : suggestion.sectionChanges)) {
    suggestion.sectionChanges.forEach((section) => {
      if (!section)
        return;
      const weight = Number.isFinite(section.count) ? Number(section.count) : 1;
      registerSectionChange(
        section.key || section.section || section.label,
        section.label || section.section || section.key,
        weight
      );
    });
  }
  if ((_a = suggestion == null ? void 0 : suggestion.rescore) == null ? void 0 : _a.section) {
    const rescoreSection = suggestion.rescore.section;
    registerSectionChange(rescoreSection.key || rescoreSection.label, rescoreSection.label || rescoreSection.key);
  }
  const aggregateUnique = (items) => {
    const seen = /* @__PURE__ */ new Set();
    const ordered = [];
    items.forEach((item) => {
      const text = typeof item === "string" ? item.trim() : String(item || "").trim();
      if (!text)
        return;
      const key = text.toLowerCase();
      if (seen.has(key))
        return;
      seen.add(key);
      ordered.push(text);
    });
    return ordered;
  };
  const addedItems = aggregateUnique(summarySegments.flatMap((segment) => segment.added || []));
  const removedItems = aggregateUnique(summarySegments.flatMap((segment) => segment.removed || []));
  const suggestionType = (suggestion == null ? void 0 : suggestion.type) || "";
  const reasonHints = ITEM_REASON_HINTS_BY_SUGGESTION[suggestionType] || {};
  const itemizedMap = /* @__PURE__ */ new Map();
  const pairedAddedItems = /* @__PURE__ */ new Set();
  const pairedRemovedItems = /* @__PURE__ */ new Set();
  const normalizeReasonInput = (input) => {
    if (!input)
      return [];
    if (Array.isArray(input)) {
      return input.map((line) => typeof line === "string" ? line.trim() : "").filter(Boolean);
    }
    if (typeof input === "string") {
      const trimmed = input.trim();
      return trimmed ? [trimmed] : [];
    }
    return [];
  };
  const resolveReasonList = (input, changeType) => {
    const normalized = normalizeReasonInput(input);
    if (normalized.length > 0) {
      return normalized;
    }
    const typeHint = reasonHints[changeType];
    if (typeHint) {
      return [typeHint];
    }
    const defaultReason = DEFAULT_ITEM_REASON_BY_CHANGE_TYPE[changeType] || DEFAULT_ITEM_REASON_BY_CHANGE_TYPE.default;
    return defaultReason ? [defaultReason] : [];
  };
  const registerItemizedChange = (item, changeType, reasonInput) => {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text)
      return;
    const normalizedType = changeType === "rephrased" ? "replaced" : changeType;
    if (!normalizedType)
      return;
    const key = `${normalizedType}::${text.toLowerCase()}`;
    const existing = itemizedMap.get(key) || {
      item: text,
      changeType: normalizedType,
      reasons: /* @__PURE__ */ new Set()
    };
    resolveReasonList(reasonInput, normalizedType).forEach((line) => {
      if (line) {
        existing.reasons.add(line);
      }
    });
    itemizedMap.set(key, existing);
  };
  summarySegments.forEach((segment) => {
    if (!segment)
      return;
    const addedList = Array.isArray(segment.added) ? segment.added : [];
    const removedList = Array.isArray(segment.removed) ? segment.removed : [];
    const segmentReason = Array.isArray(segment.reason) && segment.reason.length > 0 ? segment.reason : detailText;
    const pairCount = Math.min(addedList.length, removedList.length);
    for (let index2 = 0; index2 < pairCount; index2 += 1) {
      const beforeItem = typeof removedList[index2] === "string" ? removedList[index2].trim() : "";
      const afterItem = typeof addedList[index2] === "string" ? addedList[index2].trim() : "";
      if (!beforeItem || !afterItem) {
        continue;
      }
      registerItemizedChange(`${beforeItem} → ${afterItem}`, "replaced", segmentReason);
      pairedAddedItems.add(afterItem.toLowerCase());
      pairedRemovedItems.add(beforeItem.toLowerCase());
    }
    addedList.slice(pairCount).forEach((item) => {
      registerItemizedChange(item, "added", segmentReason);
    });
    removedList.slice(pairCount).forEach((item) => {
      registerItemizedChange(item, "removed", segmentReason);
    });
  });
  addedItems.forEach((item) => {
    const lower = item.toLowerCase();
    if (!pairedAddedItems.has(lower)) {
      registerItemizedChange(item, "added", detailText);
    }
  });
  removedItems.forEach((item) => {
    const lower = item.toLowerCase();
    if (!pairedRemovedItems.has(lower)) {
      registerItemizedChange(item, "removed", detailText);
    }
  });
  const beforeExcerpt = ((suggestion == null ? void 0 : suggestion.beforeExcerpt) || "").trim();
  const afterExcerpt = ((suggestion == null ? void 0 : suggestion.afterExcerpt) || "").trim();
  if (beforeExcerpt && afterExcerpt && beforeExcerpt !== afterExcerpt) {
    registerItemizedChange(`${beforeExcerpt} → ${afterExcerpt}`, "replaced", reason || detailText);
  } else if (!beforeExcerpt && afterExcerpt) {
    registerItemizedChange(afterExcerpt, "added", reason || detailText);
  } else if (beforeExcerpt && !afterExcerpt) {
    registerItemizedChange(beforeExcerpt, "removed", reason || detailText);
  }
  const changeTypeOrder = { added: 0, replaced: 1, removed: 2 };
  const itemizedChanges = Array.from(itemizedMap.values()).map((entry) => ({
    item: entry.item,
    changeType: entry.changeType,
    reasons: Array.from(entry.reasons)
  })).sort((a, b) => {
    const orderA = changeTypeOrder[a.changeType] ?? 99;
    const orderB = changeTypeOrder[b.changeType] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.item.localeCompare(b.item, void 0, { sensitivity: "base" });
  });
  const categoryChangelog = buildCategoryChangeLog({
    summarySegments,
    detail: detailText,
    addedItems,
    removedItems,
    itemizedChanges,
    before: beforeExcerpt,
    after: afterExcerpt,
    scoreDelta: suggestion == null ? void 0 : suggestion.scoreDelta,
    suggestionType: suggestion == null ? void 0 : suggestion.type
  });
  if (sectionChangeMap.size === 0) {
    const fallbackSection = CHANGE_LOG_SECTIONS_BY_TYPE[suggestionType];
    if (fallbackSection) {
      registerSectionChange(fallbackSection.key, fallbackSection.label);
    }
  }
  const sectionChanges = Array.from(sectionChangeMap.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.label.localeCompare(b.label);
  });
  return {
    id: suggestion == null ? void 0 : suggestion.id,
    label,
    title: (suggestion == null ? void 0 : suggestion.title) || "Improvement Applied",
    detail: detailText.trim(),
    before: beforeExcerpt,
    after: afterExcerpt,
    timestamp: Date.now(),
    type: (suggestion == null ? void 0 : suggestion.type) || "custom",
    summarySegments,
    addedItems,
    removedItems,
    itemizedChanges,
    categoryChangelog,
    sectionChanges,
    scoreDelta: typeof (suggestion == null ? void 0 : suggestion.scoreDelta) === "number" && Number.isFinite(suggestion.scoreDelta) ? suggestion.scoreDelta : null
  };
}
function formatScoreDelta(delta) {
  if (typeof delta !== "number" || Number.isNaN(delta)) {
    return null;
  }
  const rounded = Math.round(delta);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded} pts`;
}
function resolveDeltaTone(delta) {
  if (typeof delta !== "number" || Number.isNaN(delta)) {
    return "text-slate-600";
  }
  if (delta > 0) {
    return "text-emerald-600";
  }
  if (delta < 0) {
    return "text-rose-600";
  }
  return "text-slate-600";
}
function normalizeRescoreSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }
  try {
    return cloneData(summary);
  } catch (err) {
    console.error("Unable to clone rescore summary, falling back to shallow copy", err);
    return { ...summary };
  }
}
function deriveSelectionMeaning(value, fallback = null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (value >= 75) {
    return "High";
  }
  if (value >= 55) {
    return "Medium";
  }
  return "Low";
}
function buildSelectionRationale(value, meaning, fallback = null) {
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }
  if (typeof value === "number" && Number.isFinite(value) && meaning) {
    const rounded = Math.round(value);
    return `Projected ${meaning.toLowerCase()} probability (${rounded}%) that this resume will be shortlisted for the JD.`;
  }
  return fallback;
}
function cloneData(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (err) {
      console.error("Structured clone failed, falling back to JSON cloning", err);
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    console.error("JSON clone failed, falling back to shallow copy", err);
    return Array.isArray(value) ? [...value] : { ...value };
  }
}
function orderAtsMetrics(metrics) {
  if (!Array.isArray(metrics))
    return [];
  const categoryMap = /* @__PURE__ */ new Map();
  metrics.filter(Boolean).forEach((metric) => {
    if (metric == null ? void 0 : metric.category) {
      categoryMap.set(metric.category, metric);
    }
  });
  const ordered = ATS_SUB_SCORE_ORDER.map((category) => categoryMap.get(category)).filter(Boolean);
  const extras = metrics.filter(
    (metric) => (metric == null ? void 0 : metric.category) && !ATS_SUB_SCORE_ORDER.includes(metric.category)
  );
  return [...ordered, ...extras];
}
function getApiBaseCandidate() {
  if (typeof window !== "undefined") {
    const fromWindow = window.__RESUMEFORGE_API_BASE_URL__;
    if (typeof fromWindow === "string" && fromWindow.trim()) {
      return fromWindow.trim();
    }
    if (typeof document !== "undefined") {
      const metaTag = document.querySelector('meta[name="resumeforge-api-base"]');
      const metaContent = metaTag == null ? void 0 : metaTag.content;
      if (typeof metaContent === "string" && metaContent.trim()) {
        return metaContent.trim();
      }
    }
  }
  if (typeof process !== "undefined" && process.env) {
    if (typeof {}.VITE_API_BASE_URL === "string" && {}.VITE_API_BASE_URL.trim()) {
      return {}.VITE_API_BASE_URL.trim();
    }
    if (typeof {}.RESUMEFORGE_API_BASE_URL === "string" && {}.RESUMEFORGE_API_BASE_URL.trim()) {
      return {}.RESUMEFORGE_API_BASE_URL.trim();
    }
  }
  return "";
}
function ImprovementCard({ suggestion, onReject, onPreview }) {
  const deltaText = formatScoreDelta(suggestion.scoreDelta);
  const deltaTone = resolveDeltaTone(suggestion.scoreDelta);
  const rawConfidence = typeof suggestion.confidence === "number" && Number.isFinite(suggestion.confidence) ? suggestion.confidence : null;
  const confidenceDisplay = rawConfidence !== null ? `${Math.round(rawConfidence * 100)}%` : "—";
  const confidenceDescription = "Indicates how certain ResumeForge is that this change will resonate with ATS scoring and recruiter expectations based on the source analysis.";
  const deltaDescription = "Estimated impact on your ATS score if you apply this improvement. Positive values mean a projected lift; negative values signal a potential drop.";
  const improvementHints = reactExports.useMemo(() => {
    if (!Array.isArray(suggestion.improvementSummary))
      return [];
    return suggestion.improvementSummary.map((segment) => buildActionableHint(segment)).filter(Boolean);
  }, [suggestion.improvementSummary]);
  const normalizedValidation = reactExports.useMemo(
    () => normalizeImprovementValidation(suggestion.validation),
    [suggestion.validation]
  );
  const jobAlignment = normalizedValidation.jobAlignment || {};
  const validationStatus = resolveImprovementValidationStatus(normalizedValidation);
  const validationLabel = (() => {
    switch (validationStatus) {
      case "passed":
        return "JD alignment confirmed";
      case "failed":
        return "Needs JD alignment";
      case "skipped":
        return "JD validation unavailable";
      default:
        return "JD validation pending";
    }
  })();
  const validationToneClass = validationStatus === "passed" ? "text-emerald-700" : validationStatus === "failed" ? "text-rose-600" : "text-slate-600";
  const validationMessage = (() => {
    if (jobAlignment.reason) {
      return jobAlignment.reason;
    }
    if (validationStatus === "failed") {
      return "No JD keywords matched this rewrite.";
    }
    if (validationStatus === "skipped") {
      return "No JD keywords were supplied to validate this section.";
    }
    if (validationStatus === "unknown") {
      return "Validation pending — rerun ATS scoring once improvements are applied.";
    }
    return "";
  })();
  const validationHighlights = reactExports.useMemo(() => {
    const highlights = [
      ...Array.isArray(jobAlignment.matchedSkills) ? jobAlignment.matchedSkills : [],
      ...Array.isArray(jobAlignment.coveredSkills) ? jobAlignment.coveredSkills : []
    ];
    return toUniqueList(highlights);
  }, [jobAlignment.coveredSkills, jobAlignment.matchedSkills]);
  const areaImpactRows = reactExports.useMemo(() => {
    var _a;
    const overallSummary = (_a = suggestion == null ? void 0 : suggestion.rescoreSummary) == null ? void 0 : _a.overall;
    if (!overallSummary || typeof overallSummary !== "object") {
      return [];
    }
    const toMetricList = (section) => {
      if (!section || typeof section !== "object") {
        return [];
      }
      if (Array.isArray(section.atsSubScores)) {
        return orderAtsMetrics(section.atsSubScores);
      }
      if (Array.isArray(section.scoreBreakdown)) {
        return orderAtsMetrics(section.scoreBreakdown);
      }
      if (section.scoreBreakdown && typeof section.scoreBreakdown === "object") {
        return orderAtsMetrics(Object.values(section.scoreBreakdown));
      }
      return [];
    };
    const beforeList = toMetricList(overallSummary.before);
    const afterList = toMetricList(overallSummary.after);
    if (!beforeList.length && !afterList.length) {
      return [];
    }
    const combined = orderAtsMetrics([...beforeList, ...afterList]);
    const seen = /* @__PURE__ */ new Set();
    return combined.map((metric) => {
      const category = metric == null ? void 0 : metric.category;
      if (!category || seen.has(category)) {
        return null;
      }
      seen.add(category);
      const beforeMetric = beforeList.find((item) => (item == null ? void 0 : item.category) === category);
      const afterMetric = afterList.find((item) => (item == null ? void 0 : item.category) === category);
      const beforeScore = typeof (beforeMetric == null ? void 0 : beforeMetric.score) === "number" && Number.isFinite(beforeMetric.score) ? beforeMetric.score : null;
      const afterScore = typeof (afterMetric == null ? void 0 : afterMetric.score) === "number" && Number.isFinite(afterMetric.score) ? afterMetric.score : null;
      const delta = beforeScore !== null && afterScore !== null ? afterScore - beforeScore : null;
      if (beforeScore === null && afterScore === null) {
        return null;
      }
      return {
        category,
        beforeScore,
        afterScore,
        delta
      };
    }).filter(Boolean);
  }, [suggestion == null ? void 0 : suggestion.rescoreSummary]);
  const actionableHints = improvementHints.length ? improvementHints : ["Review this update and prepare to speak to the new talking points."];
  const formatMetricScore = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(value) : "—";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-white/80 backdrop-blur border border-purple-200/60 shadow p-5 flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-lg font-semibold text-purple-800", children: suggestion.title }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 flex items-center gap-2 text-xs uppercase tracking-wide text-purple-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "Confidence: ",
            confidenceDisplay
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            InfoTooltip,
            {
              variant: "light",
              align: "left",
              maxWidthClass: "w-72",
              label: "What does the improvement confidence mean?",
              content: confidenceDescription
            }
          )
        ] })
      ] }),
      suggestion.accepted !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: `text-xs px-3 py-1 rounded-full ${suggestion.accepted ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`,
          children: suggestion.accepted ? "Accepted" : "Rejected"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-900/80 leading-relaxed", children: suggestion.explanation }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3 text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-purple-50 border border-purple-200 rounded-lg p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase font-semibold text-purple-500", children: "Before" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-purple-800 whitespace-pre-wrap", children: suggestion.beforeExcerpt || "—" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-indigo-50 border border-indigo-200 rounded-lg p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase font-semibold text-indigo-500", children: "After" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-indigo-800 whitespace-pre-wrap", children: suggestion.afterExcerpt || "—" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-purple-200/70 bg-white/70 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-600", children: "JD Alignment Check" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-sm font-semibold ${validationToneClass}`, children: validationLabel }),
      validationMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-purple-700/80", children: validationMessage }),
      validationHighlights.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs text-purple-700/80", children: [
        "Reinforced keywords: ",
        validationHighlights.join(", ")
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-purple-200/70 bg-purple-50/60 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-600", children: "AI added/modified these · Learn this for your interview" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 list-disc space-y-1 pl-5 text-sm text-purple-900/80", children: actionableHints.map((hint, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: hint }, `${hint}-${index2}`)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
      deltaText && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: `text-sm font-semibold ${deltaTone}`, children: [
          "ATS score delta: ",
          deltaText
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          InfoTooltip,
          {
            variant: "light",
            align: "left",
            maxWidthClass: "w-72",
            label: "What does ATS score delta mean?",
            content: deltaDescription
          }
        )
      ] }),
      suggestion.rescorePending && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-purple-600", children: "Updating ATS dashboard…" }),
      suggestion.rescoreError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-rose-600", children: suggestion.rescoreError })
    ] }),
    areaImpactRows.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-purple-200/60 bg-purple-50/50 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-600", children: "ATS area impact" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 space-y-2", children: areaImpactRows.map((row) => {
        const areaDeltaText = formatScoreDelta(row.delta);
        const areaTone = resolveDeltaTone(row.delta);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-3 py-2",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: row.category }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-purple-900/80", children: [
                  formatMetricScore(row.beforeScore),
                  " → ",
                  formatMetricScore(row.afterScore)
                ] })
              ] }),
              areaDeltaText && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-sm font-semibold ${areaTone}`, children: areaDeltaText })
            ]
          },
          row.category
        );
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-3 justify-end pt-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onPreview,
          className: "px-4 py-2 rounded-full text-sm font-semibold border border-indigo-200 text-indigo-600 hover:bg-indigo-50",
          children: "Show Me Proposed Changes"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onReject,
          className: "px-4 py-2 rounded-full text-sm font-medium border border-rose-300 text-rose-600 hover:bg-rose-50",
          children: "Reject"
        }
      )
    ] })
  ] });
}
function App() {
  var _a;
  const [manualJobDescription, setManualJobDescription] = reactExports.useState("");
  const pendingImprovementRescoreRef = reactExports.useRef([]);
  const runQueuedImprovementRescoreRef = reactExports.useRef(null);
  const persistChangeLogEntryRef = reactExports.useRef(null);
  const rescoreAfterImprovementRef = reactExports.useRef(null);
  const analysisContextRef = reactExports.useRef({ hasAnalysis: false, cvSignature: "", jobSignature: "", jobId: "" });
  const rawBaseUrl = reactExports.useMemo(() => getApiBaseCandidate(), []);
  const API_BASE_URL = reactExports.useMemo(() => resolveApiBase(rawBaseUrl), [rawBaseUrl]);
  const [manualCertificatesInput, setManualCertificatesInput] = reactExports.useState("");
  const [cvFile, setCvFile] = reactExports.useState(null);
  const [isProcessing, setIsProcessing] = reactExports.useState(false);
  const [pollingJobId, setPollingJobId] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (!pollingJobId)
      return;
    let isMounted = true;
    const poll = async () => {
      var _a2, _b, _c, _d;
      try {
        const response = await fetch(`${API_BASE_URL}/api/job-status?jobId=${pollingJobId}`);
        if (!response.ok)
          return;
        const data = await response.json();
        if (data.success && (data.status === "scored" || data.status === "completed") && data.rescore) {
          if (isMounted) {
            setPollingJobId(null);
            setQueuedMessage("");
            const rescore = data.rescore;
            const before = ((_a2 = rescore.overall) == null ? void 0 : _a2.before) || {};
            const after = ((_b = rescore.overall) == null ? void 0 : _b.after) || {};
            const insights = rescore.selectionInsights || {};
            const normalizePercent2 = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
            const probabilityValue = normalizePercent2(insights.probability);
            const probabilityMeaning = insights.level;
            const probabilityRationale = insights.message || insights.rationale;
            const matchPayload = {
              table: [],
              addedSkills: ((_d = (_c = rescore.overall) == null ? void 0 : _c.delta) == null ? void 0 : _d.coveredSkills) || [],
              missingSkills: before.missingSkills || [],
              atsScoreBefore: normalizePercent2(before.score),
              atsScoreAfter: normalizePercent2(after.score),
              originalScore: normalizePercent2(before.score),
              enhancedScore: normalizePercent2(after.score),
              originalTitle: data.originalTitle || "",
              modifiedTitle: data.modifiedTitle || "",
              selectionProbability: probabilityValue,
              selectionProbabilityMeaning: probabilityMeaning,
              selectionProbabilityRationale: probabilityRationale,
              selectionProbabilityBefore: probabilityValue,
              selectionProbabilityBeforeMeaning: probabilityMeaning,
              selectionProbabilityBeforeRationale: probabilityRationale,
              selectionProbabilityAfter: probabilityValue,
              selectionProbabilityAfterMeaning: probabilityMeaning,
              selectionProbabilityAfterRationale: probabilityRationale,
              selectionProbabilityFactors: insights.factors || [],
              atsScoreBeforeExplanation: "",
              atsScoreAfterExplanation: "",
              originalScoreExplanation: "",
              enhancedScoreExplanation: ""
            };
            setMatch(matchPayload);
            setScoreBreakdown(after.scoreBreakdown || []);
            setBaselineScoreBreakdown(before.scoreBreakdown || []);
            if (data.jobId) {
              analysisContextRef.current.jobId = data.jobId;
            }
            setIsProcessing(false);
          }
        }
      } catch (err) {
        console.error("Polling failed", err);
      }
    };
    const intervalId = setInterval(poll, 3e3);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [pollingJobId, API_BASE_URL]);
  const [outputFiles, setOutputFiles] = reactExports.useState([]);
  const [downloadGeneratedAt, setDownloadGeneratedAt] = reactExports.useState("");
  const [downloadStates, setDownloadStates] = reactExports.useState({});
  const [artifactsUploaded, setArtifactsUploaded] = reactExports.useState(false);
  const [match, setMatch] = reactExports.useState(null);
  const [scoreBreakdown, setScoreBreakdown] = reactExports.useState([]);
  const [baselineScoreBreakdown, setBaselineScoreBreakdown] = reactExports.useState([]);
  const [resumeText, setResumeText] = reactExports.useState("");
  const [jobDescriptionText, setJobDescriptionText] = reactExports.useState("");
  const manualJobDescriptionValue = reactExports.useMemo(() => {
    return typeof manualJobDescription === "string" ? manualJobDescription.trim() : "";
  }, [manualJobDescription]);
  const manualJobDescriptionHasProhibitedHtml = reactExports.useMemo(
    () => containsProhibitedJobDescriptionHtml(manualJobDescription),
    [manualJobDescription]
  );
  const manualJobDescriptionLooksLikeUrl = reactExports.useMemo(
    () => looksLikeJobDescriptionUrl(manualJobDescriptionValue),
    [manualJobDescriptionValue]
  );
  const parsedJobDescription = reactExports.useMemo(
    () => parseJobDescriptionText(jobDescriptionText),
    [jobDescriptionText]
  );
  const parsedJobTitle = reactExports.useMemo(() => {
    const candidateTitle = typeof (parsedJobDescription == null ? void 0 : parsedJobDescription.title) === "string" ? parsedJobDescription.title.trim() : "";
    if (!candidateTitle)
      return "";
    if (/^job description$/i.test(candidateTitle))
      return "";
    return candidateTitle;
  }, [parsedJobDescription]);
  const [jobSkills, setJobSkills] = reactExports.useState([]);
  const [resumeSkills, setResumeSkills] = reactExports.useState([]);
  const [knownCertificates, setKnownCertificates] = reactExports.useState([]);
  const [manualCertificatesData, setManualCertificatesData] = reactExports.useState([]);
  const [certificateInsights, setCertificateInsights] = reactExports.useState(null);
  const [selectionInsights, setSelectionInsights] = reactExports.useState(null);
  const [improvementResults, setImprovementResults] = reactExports.useState([]);
  const [enhanceAllSummaryText, setEnhanceAllSummaryText] = reactExports.useState("");
  const [changeLog, setChangeLog] = reactExports.useState([]);
  const changeLogSummaryData = reactExports.useMemo(
    () => buildAggregatedChangeLogSummary(changeLog),
    [changeLog]
  );
  const changeLogSummaryContext = reactExports.useMemo(() => {
    var _a2, _b, _c, _d;
    const jobDescriptionValue = typeof jobDescriptionText === "string" ? jobDescriptionText.trim() : "";
    const jobTitleCandidates = [
      parsedJobTitle,
      typeof (parsedJobDescription == null ? void 0 : parsedJobDescription.title) === "string" ? parsedJobDescription.title : "",
      ((_a2 = selectionInsights == null ? void 0 : selectionInsights.designation) == null ? void 0 : _a2.targetTitle) || ""
    ];
    const jobTitle = jobTitleCandidates.map((value) => typeof value === "string" ? value.trim() : "").find((value) => value && !/^job description$/i.test(value)) || "";
    const targetTitleCandidates = [
      match == null ? void 0 : match.modifiedTitle,
      (_b = selectionInsights == null ? void 0 : selectionInsights.designation) == null ? void 0 : _b.currentTitle,
      match == null ? void 0 : match.originalTitle,
      (_c = selectionInsights == null ? void 0 : selectionInsights.designation) == null ? void 0 : _c.targetTitle
    ];
    const targetTitle = targetTitleCandidates.map((value) => typeof value === "string" ? value.trim() : "").find(Boolean) || "";
    const originalTitle = typeof (match == null ? void 0 : match.originalTitle) === "string" ? match.originalTitle.trim() : "";
    const targetSummaryCandidates = [
      enhanceAllSummaryText,
      selectionInsights == null ? void 0 : selectionInsights.summary,
      selectionInsights == null ? void 0 : selectionInsights.message,
      (_d = selectionInsights == null ? void 0 : selectionInsights.designation) == null ? void 0 : _d.message
    ];
    const targetSummary = targetSummaryCandidates.map((value) => typeof value === "string" ? value.trim() : "").find(Boolean) || "";
    return {
      jobTitle,
      jobDescription: jobDescriptionValue,
      targetTitle,
      originalTitle,
      targetSummary
    };
  }, [
    jobDescriptionText,
    parsedJobDescription,
    parsedJobTitle,
    selectionInsights,
    match,
    enhanceAllSummaryText
  ]);
  const [activeDashboardStage, setActiveDashboardStage] = reactExports.useState("score");
  const [activeImprovement, setActiveImprovement] = reactExports.useState("");
  const [activeImprovementBatchKeys, setActiveImprovementBatchKeys] = reactExports.useState([]);
  const [selectedImprovementKeys, setSelectedImprovementKeys] = reactExports.useState([]);
  const selectedImprovementSet = reactExports.useMemo(
    () => new Set(selectedImprovementKeys.filter((key) => typeof key === "string" && key.trim())),
    [selectedImprovementKeys]
  );
  const selectedImprovementCount = selectedImprovementSet.size;
  const hasSelectedImprovements = selectedImprovementCount > 0;
  const [isBulkAccepting, setIsBulkAccepting] = reactExports.useState(false);
  const [error, setErrorState] = reactExports.useState("");
  const [errorRecovery, setErrorRecovery] = reactExports.useState(null);
  const [errorContext, setErrorContext] = reactExports.useState({ source: "", code: "", requestId: "" });
  const [errorLogs, setErrorLogs] = reactExports.useState([]);
  const [stageErrors, setStageErrors] = reactExports.useState(() => createStageErrorState());
  const [environmentHost] = reactExports.useState(() => {
    if (typeof window === "undefined" || !window.location) {
      return "";
    }
    return typeof window.location.hostname === "string" ? window.location.hostname : "";
  });
  const [environmentOrigin] = reactExports.useState(() => {
    if (typeof window === "undefined" || !window.location) {
      return "";
    }
    return typeof window.location.origin === "string" ? window.location.origin : "";
  });
  const [cloudfrontMetadata, setCloudfrontMetadata] = reactExports.useState(() => {
    var _a2;
    if (typeof window === "undefined") {
      return { canonicalUrl: "", canonicalHost: "", apiGatewayUrl: "", updatedAt: "" };
    }
    const preload = window.__RESUMEFORGE_CLOUDFRONT_DEGRADE__ || {};
    const canonicalUrl = typeof preload.canonicalUrl === "string" && preload.canonicalUrl.trim() ? preload.canonicalUrl.trim() : "";
    let canonicalHost = "";
    if (canonicalUrl) {
      try {
        canonicalHost = new URL(canonicalUrl, window.location.href).hostname;
      } catch (error2) {
        console.warn("Unable to parse canonical CloudFront URL from preload metadata.", error2);
        canonicalHost = "";
      }
    }
    const apiGatewayUrl = typeof preload.backupApiGatewayUrl === "string" && preload.backupApiGatewayUrl.trim() ? preload.backupApiGatewayUrl.trim() : typeof ((_a2 = window.location) == null ? void 0 : _a2.origin) === "string" ? window.location.origin : "";
    const detectedAt = typeof preload.detectedAt === "string" && preload.detectedAt.trim() ? preload.detectedAt.trim() : "";
    return {
      canonicalUrl,
      canonicalHost,
      apiGatewayUrl,
      updatedAt: detectedAt
    };
  });
  const setError = reactExports.useCallback((value, options = {}) => {
    const nextMessage = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
    const trimmedMessage = nextMessage.trim();
    setErrorState(trimmedMessage);
    const normalizedStage = normalizeStageKey(options == null ? void 0 : options.stage);
    if (normalizedStage) {
      setStageErrors((prev) => {
        const safePrev = prev && typeof prev === "object" ? prev : createStageErrorState();
        const currentValue = typeof safePrev[normalizedStage] === "string" ? safePrev[normalizedStage] : "";
        if (currentValue === trimmedMessage) {
          return safePrev === prev ? prev : { ...safePrev };
        }
        return { ...safePrev, [normalizedStage]: trimmedMessage };
      });
    } else if (!trimmedMessage) {
      setStageErrors(createStageErrorState());
    }
    const allowRetryOption = typeof (options == null ? void 0 : options.allowRetry) === "boolean" ? options.allowRetry : void 0;
    const allowRetry = allowRetryOption !== false;
    const rawRecoveryKey = typeof (options == null ? void 0 : options.recovery) === "string" && options.recovery.trim() ? options.recovery.trim() : allowRetry ? "generation" : "";
    let normalizedRecoveryKey = rawRecoveryKey ? rawRecoveryKey.toLowerCase() : "";
    const requestIdOption = typeof (options == null ? void 0 : options.requestId) === "string" ? options.requestId.trim() : "";
    const logsOption = Array.isArray(options == null ? void 0 : options.logs) && options.logs.length > 0 ? options.logs.filter((entry) => entry && typeof entry === "object") : [];
    if (trimmedMessage) {
      const providedCode = typeof (options == null ? void 0 : options.errorCode) === "string" ? options.errorCode.trim().toUpperCase() : "";
      const providedSource = normalizeServiceSource(options == null ? void 0 : options.serviceError);
      const derivedSource = providedSource || (providedCode ? normalizeServiceSource(
        SERVICE_ERROR_SOURCE_BY_CODE[providedCode] || ""
      ) : "");
      if (!normalizedRecoveryKey && allowRetry) {
        normalizedRecoveryKey = "generation";
      }
      setErrorContext({ source: derivedSource, code: providedCode, requestId: requestIdOption });
      setErrorLogs(logsOption);
    } else {
      setErrorContext({ source: "", code: "", requestId: "" });
      setErrorLogs([]);
    }
    if (trimmedMessage && normalizedRecoveryKey) {
      setErrorRecovery(normalizedRecoveryKey);
    } else {
      setErrorRecovery(null);
    }
  }, [setErrorContext, setErrorLogs, setStageErrors]);
  const cloudfrontFallbackActive = reactExports.useMemo(() => {
    if (!environmentHost) {
      return false;
    }
    if (/\.execute-api\.[^.]+\.amazonaws\.com$/i.test(environmentHost)) {
      return true;
    }
    if (cloudfrontMetadata.canonicalHost) {
      const canonicalHost = cloudfrontMetadata.canonicalHost;
      const canonicalLooksLikeCloudfront = /\.cloudfront\.net$/i.test(canonicalHost);
      const locationLooksLikeCloudfront = /\.cloudfront\.net$/i.test(environmentHost);
      if (canonicalLooksLikeCloudfront && canonicalHost !== environmentHost && !locationLooksLikeCloudfront) {
        return true;
      }
    }
    return false;
  }, [cloudfrontMetadata.canonicalHost, environmentHost]);
  reactExports.useEffect(() => {
    if (typeof document === "undefined") {
      return void 0;
    }
    const value = cloudfrontMetadata.apiGatewayUrl || environmentOrigin || "";
    const inputs = document.querySelectorAll("input[data-backup-api-base]");
    inputs.forEach((input) => {
      if (input) {
        input.value = value;
        input.setAttribute("value", value);
      }
    });
    return void 0;
  }, [cloudfrontMetadata.apiGatewayUrl, environmentOrigin]);
  reactExports.useEffect(() => {
    if (typeof window === "undefined" || typeof fetch !== "function") {
      return void 0;
    }
    let cancelled = false;
    let controller = null;
    if (typeof AbortController === "function") {
      controller = new AbortController();
    }
    const options = controller ? { signal: controller.signal } : void 0;
    const endpoints = ["/api/published-cloudfront", "/api/published-cloudfront.json"];
    (async () => {
      let lastError = null;
      for (const endpoint of endpoints) {
        if (cancelled) {
          return;
        }
        const url = typeof endpoint === "string" ? endpoint : "";
        if (!url) {
          continue;
        }
        let response;
        try {
          response = await fetch(url, options);
        } catch (error2) {
          if ((error2 == null ? void 0 : error2.name) === "AbortError") {
            return;
          }
          lastError = error2;
          continue;
        }
        if (!response || !response.ok) {
          continue;
        }
        let data = null;
        try {
          data = await response.json();
        } catch (error2) {
          lastError = error2;
          continue;
        }
        if (cancelled || !data || !data.cloudfront) {
          continue;
        }
        const canonicalUrl = typeof data.cloudfront.url === "string" && data.cloudfront.url.trim() ? data.cloudfront.url.trim() : "";
        let canonicalHost = "";
        if (canonicalUrl) {
          try {
            canonicalHost = new URL(canonicalUrl, window.location.href).hostname;
          } catch (error2) {
            console.warn("Unable to parse canonical CloudFront URL from API metadata.", error2);
            canonicalHost = "";
          }
        }
        const apiGatewayUrl = typeof data.cloudfront.apiGatewayUrl === "string" && data.cloudfront.apiGatewayUrl.trim() ? data.cloudfront.apiGatewayUrl.trim() : "";
        const updatedAt = typeof data.cloudfront.updatedAt === "string" && data.cloudfront.updatedAt.trim() ? data.cloudfront.updatedAt.trim() : "";
        setCloudfrontMetadata((prev) => ({
          canonicalUrl: canonicalUrl || prev.canonicalUrl,
          canonicalHost: canonicalHost || prev.canonicalHost,
          apiGatewayUrl: apiGatewayUrl || prev.apiGatewayUrl || environmentOrigin,
          updatedAt: updatedAt || prev.updatedAt
        }));
        return;
      }
      if (lastError && (lastError == null ? void 0 : lastError.name) !== "AbortError") {
        console.warn("Unable to load published CloudFront metadata within the app.", lastError);
      }
    })();
    return () => {
      cancelled = true;
      if (controller) {
        controller.abort();
      }
    };
  }, [environmentOrigin]);
  reactExports.useEffect(() => {
    if (typeof window === "undefined") {
      return void 0;
    }
    if (!cloudfrontFallbackActive) {
      return void 0;
    }
    try {
      window.__RESUMEFORGE_CLOUDFRONT_DEGRADE__ = {
        canonicalUrl: cloudfrontMetadata.canonicalUrl || "",
        backupApiGatewayUrl: cloudfrontMetadata.apiGatewayUrl || environmentOrigin || "",
        detectedAt: cloudfrontMetadata.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (error2) {
      console.warn("Unable to update CloudFront fallback metadata on the window.", error2);
    }
    return void 0;
  }, [
    cloudfrontFallbackActive,
    cloudfrontMetadata.apiGatewayUrl,
    cloudfrontMetadata.canonicalUrl,
    cloudfrontMetadata.updatedAt,
    environmentOrigin
  ]);
  const [queuedMessage, setQueuedMessage] = reactExports.useState("");
  const [selectedTemplate, setSelectedTemplate] = reactExports.useState("modern");
  const [previewSuggestion, setPreviewSuggestion] = reactExports.useState(null);
  const [previewActionBusy, setPreviewActionBusy] = reactExports.useState(false);
  const [previewActiveAction, setPreviewActiveAction] = reactExports.useState("");
  const [previewFile, setPreviewFile] = reactExports.useState(null);
  const [pendingDownloadFile, setPendingDownloadFile] = reactExports.useState(null);
  const [initialAnalysisSnapshot, setInitialAnalysisSnapshot] = reactExports.useState(null);
  const [jobId, setJobId] = reactExports.useState("");
  const [templateContext, setTemplateContext] = reactExports.useState(null);
  const [isGeneratingDocs, setIsGeneratingDocs] = reactExports.useState(false);
  const [manualJobDescriptionRequired, setManualJobDescriptionRequired] = reactExports.useState(false);
  const manualJobDescriptionHasError = manualJobDescriptionRequired || manualJobDescriptionLooksLikeUrl || manualJobDescriptionHasProhibitedHtml;
  const manualJobDescriptionHelperText = manualJobDescriptionHasProhibitedHtml ? "Remove HTML tags like <script> before continuing." : manualJobDescriptionLooksLikeUrl ? "Paste the full job description text instead of a link." : manualJobDescriptionRequired ? "Paste the full job description to continue." : "Paste the full JD so we analyse the exact role requirements.";
  const [coverLetterDrafts, setCoverLetterDrafts] = reactExports.useState({});
  const [coverLetterOriginals, setCoverLetterOriginals] = reactExports.useState({});
  const [coverLetterEditor, setCoverLetterEditor] = reactExports.useState(null);
  const [isCoverLetterDownloading, setIsCoverLetterDownloading] = reactExports.useState(false);
  const [coverLetterDownloadError, setCoverLetterDownloadError] = reactExports.useState("");
  const [coverLetterClipboardStatus, setCoverLetterClipboardStatus] = reactExports.useState("");
  const [coverLetterReviewState, setCoverLetterReviewState] = reactExports.useState({});
  const [resumeHistory, setResumeHistory] = reactExports.useState([]);
  const updateOutputFiles = reactExports.useCallback((files, options = {}) => {
    setOutputFiles(files);
    let nextTimestamp = "";
    const providedTimestamp = options == null ? void 0 : options.generatedAt;
    if (providedTimestamp) {
      const providedDate = new Date(providedTimestamp);
      if (!Number.isNaN(providedDate.getTime())) {
        nextTimestamp = providedDate.toISOString();
      }
    }
    if (!nextTimestamp && Array.isArray(files) && files.length > 0) {
      nextTimestamp = (/* @__PURE__ */ new Date()).toISOString();
    }
    setDownloadGeneratedAt(nextTimestamp);
  }, []);
  const resetAnalysisState = reactExports.useCallback(() => {
    analysisContextRef.current = { hasAnalysis: false, cvSignature: "", jobSignature: "", jobId: "" };
    pendingImprovementRescoreRef.current = [];
    setDownloadStates({});
    setDownloadGeneratedAt("");
    setPendingDownloadFile(null);
    setCoverLetterReviewState({});
    setArtifactsUploaded(false);
    updateOutputFiles([]);
    setMatch(null);
    setScoreBreakdown([]);
    setBaselineScoreBreakdown([]);
    setResumeText("");
    setJobDescriptionText("");
    setJobSkills([]);
    setResumeSkills([]);
    setKnownCertificates([]);
    setManualCertificatesData([]);
    setCertificateInsights(null);
    setSelectionInsights(null);
    setImprovementResults([]);
    setChangeLog([]);
    setActiveImprovement("");
    setError("");
    setQueuedMessage("");
    setInitialAnalysisSnapshot(null);
    setJobId("");
    setTemplateContext(null);
    setIsGeneratingDocs(false);
    setCoverLetterDrafts({});
    setCoverLetterOriginals({});
    setCoverLetterEditor(null);
    setCoverLetterDownloadError("");
    setCoverLetterClipboardStatus("");
    setResumeHistory([]);
    setPreviewSuggestion(null);
    setPreviewFile(null);
    setPreviewActionBusy(false);
    setPreviewActiveAction("");
    setEnhanceAllSummaryText("");
    setIsCoverLetterDownloading(false);
    setActiveDashboardStage("score");
  }, [
    setActiveDashboardStage,
    setCoverLetterReviewState,
    setDownloadGeneratedAt,
    setDownloadStates,
    setPendingDownloadFile,
    setPreviewActionBusy,
    setPreviewActiveAction,
    updateOutputFiles
  ]);
  const resetUiAfterDownload = reactExports.useCallback(
    (message = POST_DOWNLOAD_INVITE_MESSAGE) => {
      resetAnalysisState();
      setPendingDownloadFile(null);
      setManualJobDescription("");
      setManualJobDescriptionRequired(false);
      setManualCertificatesInput("");
      setCvFile(null);
      setSelectedTemplate((current) => canonicalizeTemplateId(current) || "modern");
      lastAutoScoreSignatureRef.current = "";
      const inviteMessage = typeof message === "string" ? message.trim() : "";
      if (inviteMessage) {
        setQueuedMessage(inviteMessage);
      }
    },
    [resetAnalysisState]
  );
  const improvementLockRef = reactExports.useRef(false);
  const scoreUpdateLockRef = reactExports.useRef(false);
  const autoPreviewSignatureRef = reactExports.useRef("");
  const lastAutoScoreSignatureRef = reactExports.useRef("");
  const manualJobDescriptionRef = reactExports.useRef(null);
  const cvInputRef = reactExports.useRef(null);
  const cvSignatureRef = reactExports.useRef("");
  const jobSignatureRef = reactExports.useRef("");
  const [localUserId] = reactExports.useState(() => getOrCreateUserId());
  const userIdentifier = reactExports.useMemo(
    () => deriveUserIdentifier({ userId: localUserId }),
    [localUserId]
  );
  const currentCvSignature = reactExports.useMemo(() => {
    if (!cvFile) {
      return "";
    }
    const name = typeof cvFile.name === "string" ? cvFile.name : "";
    const lastModified = typeof cvFile.lastModified === "number" ? cvFile.lastModified : 0;
    return `${name}|${lastModified}`;
  }, [cvFile]);
  const currentJobSignature = reactExports.useMemo(() => {
    if (manualJobDescriptionValue && !manualJobDescriptionLooksLikeUrl) {
      return `manual:${manualJobDescriptionValue}`;
    }
    return "";
  }, [manualJobDescriptionLooksLikeUrl, manualJobDescriptionValue]);
  const hasMatch = Boolean(match);
  const hasCvFile = Boolean(cvFile);
  const hasManualJobDescriptionInput = Boolean(
    manualJobDescriptionValue && !manualJobDescriptionLooksLikeUrl
  );
  const improvementCount = improvementResults.length;
  const downloadCount = outputFiles.length;
  const downloadsReady = artifactsUploaded && downloadCount > 0;
  const visibleDownloadCount = downloadsReady ? downloadCount : 0;
  const downloadSuccessCount = reactExports.useMemo(
    () => {
      if (!downloadsReady || !downloadStates || typeof downloadStates !== "object") {
        return 0;
      }
      return Object.values(downloadStates).reduce((count, state) => {
        if (!state || typeof state !== "object") {
          return count;
        }
        return state.status === "completed" ? count + 1 : count;
      }, 0);
    },
    [downloadStates, downloadsReady]
  );
  const changeCount = changeLog.length;
  const scoreMetricCount = scoreBreakdown.length;
  const scoreDashboardReady = scoreMetricCount > 0;
  const hasFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
  const matchHasAtsScore = hasFiniteNumber(match == null ? void 0 : match.originalScore) || hasFiniteNumber(match == null ? void 0 : match.scoreBefore) || hasFiniteNumber(match == null ? void 0 : match.atsScoreBefore) || hasFiniteNumber(match == null ? void 0 : match.score) || hasFiniteNumber(match == null ? void 0 : match.atsScore) || hasFiniteNumber(match == null ? void 0 : match.enhancedScore) || hasFiniteNumber(match == null ? void 0 : match.scoreAfter) || hasFiniteNumber(match == null ? void 0 : match.atsScoreAfter);
  const matchHasSelectionProbability = hasFiniteNumber(match == null ? void 0 : match.selectionProbabilityBefore) || hasFiniteNumber(match == null ? void 0 : match.selectionProbabilityAfter) || hasFiniteNumber(match == null ? void 0 : match.selectionProbability) || hasFiniteNumber(match == null ? void 0 : match.selectionProbabilityDelta);
  const scoreDashboardHasContent = scoreDashboardReady || matchHasAtsScore || matchHasSelectionProbability;
  const queuedText = typeof queuedMessage === "string" ? queuedMessage.trim() : "";
  const hasAnalysisData = scoreMetricCount > 0 || hasMatch || improvementCount > 0 || visibleDownloadCount > 0 || changeCount > 0;
  const uploadReady = hasCvFile && hasManualJobDescriptionInput;
  const uploadComplete = uploadReady || hasManualJobDescriptionInput && (hasAnalysisData || Boolean(queuedText));
  const scoreComplete = scoreMetricCount > 0;
  const jdValidationComplete = Boolean(jobDescriptionText && jobDescriptionText.trim());
  const improvementsUnlocked = uploadComplete && scoreComplete && jdValidationComplete;
  const improvementUnlockMessage = !uploadComplete ? "Complete Step 1 by uploading your resume and JD to unlock scoring." : !scoreComplete ? "Finish Step 2 — we’re still calculating your ATS metrics." : !jdValidationComplete ? "Job description validation is still in progress. Please wait until it completes." : "";
  const improvementBusy = Boolean(activeImprovement);
  const improvementAvailable = improvementsUnlocked && Boolean(resumeText && resumeText.trim()) && Boolean(jobDescriptionText && jobDescriptionText.trim());
  const acceptedImprovements = reactExports.useMemo(
    () => improvementResults.filter((item) => item.accepted === true),
    [improvementResults]
  );
  const hasAcceptedImprovement = acceptedImprovements.length > 0;
  const acceptedImprovementsValidated = reactExports.useMemo(
    () => acceptedImprovements.every((item) => improvementValidationPassed(item.validation)),
    [acceptedImprovements]
  );
  const hasPendingImprovementRescore = reactExports.useMemo(
    () => acceptedImprovements.some((item) => item.rescorePending),
    [acceptedImprovements]
  );
  const hasPendingImprovementDecisions = reactExports.useMemo(
    () => improvementResults.some((item) => item.accepted === null),
    [improvementResults]
  );
  const improvementsRequireAcceptance = reactExports.useMemo(
    () => improvementResults.length > 0,
    [improvementResults]
  );
  const canGenerateEnhancedDocs = reactExports.useMemo(
    () => !improvementsRequireAcceptance || hasAcceptedImprovement && acceptedImprovementsValidated,
    [improvementsRequireAcceptance, hasAcceptedImprovement, acceptedImprovementsValidated]
  );
  const formattedCvFileSize = reactExports.useMemo(() => {
    if (!cvFile || typeof cvFile.size !== "number" || Number.isNaN(cvFile.size)) {
      return "";
    }
    const bytes = cvFile.size;
    if (bytes <= 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const size = bytes / Math.pow(1024, exponent);
    const formattedValue = size >= 10 || exponent === 0 ? size.toFixed(0) : size.toFixed(1);
    return `${formattedValue} ${units[exponent]}`;
  }, [cvFile]);
  const uploadStatusDetail = reactExports.useMemo(() => {
    const uploadStageError = typeof (stageErrors == null ? void 0 : stageErrors.upload) === "string" ? stageErrors.upload.trim() : "";
    if (uploadStageError) {
      return {
        label: uploadStageError,
        badgeClass: "border-rose-200/80 bg-rose-50/80 text-rose-600"
      };
    }
    if (error && !uploadStageError) {
      return {
        label: error,
        badgeClass: "border-rose-200/80 bg-rose-50/80 text-rose-600"
      };
    }
    if (isProcessing) {
      return {
        label: "Uploading and scoring in progress…",
        badgeClass: "border-amber-200/80 bg-amber-50/80 text-amber-700"
      };
    }
    if (queuedText) {
      return {
        label: queuedText,
        badgeClass: "border-sky-200/80 bg-sky-50/80 text-sky-700"
      };
    }
    if (uploadReady) {
      return {
        label: "Resume and JD ready — run ATS scoring when you are set.",
        badgeClass: "border-emerald-200/80 bg-emerald-50/80 text-emerald-700"
      };
    }
    if (hasCvFile && !hasManualJobDescriptionInput) {
      return {
        label: "Must paste JD",
        badgeClass: "border-amber-200/80 bg-amber-50/80 text-amber-700"
      };
    }
    if (hasCvFile) {
      return {
        label: "Resume uploaded and waiting for ATS scoring.",
        badgeClass: "border-purple-200/80 bg-white/80 text-purple-600"
      };
    }
    return {
      label: "No resume selected. Drag & drop or browse to upload.",
      badgeClass: "border-slate-200/80 bg-white/80 text-slate-600"
    };
  }, [
    error,
    hasCvFile,
    hasManualJobDescriptionInput,
    isProcessing,
    queuedText,
    uploadReady,
    stageErrors
  ]);
  const uploadStatusMessage = reactExports.useMemo(() => {
    if (isProcessing) {
      return "Uploading and scoring your resume…";
    }
    if (!cvFile) {
      return "Drag & drop a file or browse to upload. Supported formats: PDF, DOC, or DOCX (max 5 MB).";
    }
    if (!hasManualJobDescriptionInput) {
      return "Must paste JD to unlock ATS scoring.";
    }
    if (!scoreMetricCount) {
      return "Resume and JD ready — we’ll generate your ATS breakdown automatically.";
    }
    return "Resume and JD uploaded. You can rerun ATS scoring at any time from the Score stage.";
  }, [cvFile, hasManualJobDescriptionInput, isProcessing, scoreMetricCount]);
  reactExports.useEffect(() => {
    cvSignatureRef.current = currentCvSignature;
  }, [currentCvSignature]);
  reactExports.useEffect(() => {
    jobSignatureRef.current = currentJobSignature;
  }, [currentJobSignature]);
  const improvementActionMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    improvementActions.forEach((action) => {
      map.set(action.key, action);
    });
    return map;
  }, []);
  const metricImprovementActionMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    METRIC_IMPROVEMENT_PRESETS.forEach((preset) => {
      const base = improvementActionMap.get(preset.actionKey) || {};
      map.set(preset.category, {
        actionKey: preset.actionKey,
        label: preset.label || base.label || "Improve this area",
        helper: preset.helper || base.helper || ""
      });
    });
    return map;
  }, [improvementActionMap]);
  const metricImprovementState = reactExports.useMemo(
    () => ({
      activeKey: activeImprovement,
      activeBatchKeys: activeImprovementBatchKeys,
      locked: !improvementsUnlocked,
      lockMessage: improvementsUnlocked ? "" : improvementUnlockMessage
    }),
    [
      activeImprovement,
      activeImprovementBatchKeys,
      improvementUnlockMessage,
      improvementsUnlocked
    ]
  );
  const improvementButtonsDisabled = isProcessing || improvementBusy || isBulkAccepting || !improvementsUnlocked;
  const improveSkillsAction = improvementActionMap.get("add-missing-skills") || {
    label: "Improve Skills",
    helper: "Blend missing keywords into the right sections to lift your ATS alignment."
  };
  const improveCertificationsAction = improvementActionMap.get("improve-certifications") || {
    label: "Improve Certifications",
    helper: "Highlight the certifications that strengthen your case for this role."
  };
  const resumeExperienceMissing = reactExports.useMemo(() => {
    const experience = (selectionInsights == null ? void 0 : selectionInsights.experience) || null;
    const message = typeof (experience == null ? void 0 : experience.message) === "string" ? experience.message : "";
    const rawStatus = typeof (experience == null ? void 0 : experience.status) === "string" ? experience.status : "";
    const status = rawStatus.toLowerCase();
    const candidateYears = typeof (experience == null ? void 0 : experience.candidateYears) === "number" && Number.isFinite(experience.candidateYears) ? experience.candidateYears : null;
    const placeholderDetected = typeof resumeText === "string" && /work experience[\s\S]{0,200}information not provided/i.test(resumeText);
    if (placeholderDetected) {
      return true;
    }
    if (message && /not detected/i.test(message)) {
      return true;
    }
    if ((status === "gap" || status === "unknown") && (candidateYears === null || candidateYears <= 0)) {
      return true;
    }
    return false;
  }, [selectionInsights, resumeText]);
  const coverLetterContentMissing = reactExports.useMemo(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      return false;
    }
    const hasCoverLetterFiles = outputFiles.some((file) => isCoverLetterType(file == null ? void 0 : file.type));
    if (!hasCoverLetterFiles) {
      return false;
    }
    const coverLetterTypes = Array.from(COVER_LETTER_TYPES);
    const hasContent = coverLetterTypes.some((type) => {
      const draftValue = typeof (coverLetterDrafts == null ? void 0 : coverLetterDrafts[type]) === "string" ? coverLetterDrafts[type].trim() : "";
      if (draftValue) {
        return true;
      }
      const originalValue = typeof (coverLetterOriginals == null ? void 0 : coverLetterOriginals[type]) === "string" ? coverLetterOriginals[type].trim() : "";
      return Boolean(originalValue);
    });
    return !hasContent;
  }, [coverLetterDrafts, coverLetterOriginals, outputFiles]);
  reactExports.useEffect(() => {
    if (!userIdentifier) {
      return;
    }
    const storedTemplate = canonicalizeTemplateId(
      getStoredTemplatePreference(userIdentifier)
    );
    if (!storedTemplate) {
      return;
    }
    setSelectedTemplate((current) => {
      const canonicalCurrent = canonicalizeTemplateId(current);
      if (canonicalCurrent === storedTemplate) {
        return current;
      }
      return storedTemplate;
    });
    setTemplateContext((prev) => {
      if (!prev || typeof prev !== "object") {
        return prev;
      }
      const currentCanonical = canonicalizeTemplateId(
        prev.selectedTemplate || prev.template1
      );
      if (currentCanonical === storedTemplate) {
        return prev;
      }
      const base = { ...prev };
      base.selectedTemplate = storedTemplate;
      if (!base.template1) {
        base.template1 = storedTemplate;
      }
      const shouldLinkCover = base.coverTemplateLinkedToResume !== false;
      const nextContext = ensureCoverTemplateContext(base, storedTemplate, {
        linkCoverToResume: shouldLinkCover
      });
      return decorateTemplateContext(nextContext);
    });
  }, [userIdentifier]);
  reactExports.useEffect(() => {
    if (!userIdentifier) {
      return;
    }
    const canonicalSelection = canonicalizeTemplateId(selectedTemplate);
    if (!canonicalSelection) {
      return;
    }
    setStoredTemplatePreference(userIdentifier, canonicalSelection);
  }, [selectedTemplate, userIdentifier]);
  reactExports.useEffect(() => {
    if (!cvFile) {
      return;
    }
    if (manualJobDescriptionValue && !manualJobDescriptionLooksLikeUrl) {
      return;
    }
    setManualJobDescriptionRequired((prev) => {
      var _a2, _b;
      if (!prev) {
        (_b = (_a2 = manualJobDescriptionRef.current) == null ? void 0 : _a2.focus) == null ? void 0 : _b.call(_a2);
      }
      return true;
    });
  }, [cvFile, manualJobDescriptionLooksLikeUrl, manualJobDescriptionValue]);
  reactExports.useEffect(() => {
    if (manualJobDescriptionRequired && manualJobDescriptionValue && !manualJobDescriptionLooksLikeUrl && !manualJobDescriptionHasProhibitedHtml) {
      setManualJobDescriptionRequired(false);
    }
  }, [
    manualJobDescriptionLooksLikeUrl,
    manualJobDescriptionRequired,
    manualJobDescriptionValue,
    manualJobDescriptionHasProhibitedHtml
  ]);
  const resumeHistoryMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    if (Array.isArray(resumeHistory)) {
      resumeHistory.forEach((entry) => {
        if (!entry || !entry.id)
          return;
        map.set(entry.id, entry);
      });
    }
    if (Array.isArray(changeLog)) {
      changeLog.forEach((entry) => {
        if (!entry || !entry.id) {
          return;
        }
        const existing = map.get(entry.id) || {};
        const nextEntry = { ...existing };
        if (!nextEntry.id) {
          nextEntry.id = entry.id;
        }
        if (!nextEntry.suggestionId) {
          nextEntry.suggestionId = entry.id;
        }
        if (!nextEntry.title && entry.title) {
          nextEntry.title = entry.title;
        }
        if (!nextEntry.type && entry.type) {
          nextEntry.type = entry.type;
        }
        if (!nextEntry.detail && entry.detail) {
          nextEntry.detail = entry.detail;
        }
        if (!nextEntry.changeLabel && entry.label) {
          nextEntry.changeLabel = entry.label;
        }
        const beforeText = typeof nextEntry.resumeBefore === "string" && nextEntry.resumeBefore ? nextEntry.resumeBefore : typeof entry.resumeBeforeText === "string" ? entry.resumeBeforeText : "";
        if (!nextEntry.resumeBefore && beforeText) {
          nextEntry.resumeBefore = beforeText;
        }
        const afterText = typeof nextEntry.resumeAfter === "string" && nextEntry.resumeAfter ? nextEntry.resumeAfter : typeof entry.resumeAfterText === "string" ? entry.resumeAfterText : "";
        if (!nextEntry.resumeAfter && afterText) {
          nextEntry.resumeAfter = afterText;
        }
        if (!nextEntry.timestamp) {
          if (entry.acceptedAt) {
            const acceptedDate = new Date(entry.acceptedAt);
            nextEntry.timestamp = Number.isNaN(acceptedDate.getTime()) ? Date.now() : acceptedDate.getTime();
          } else if (entry.timestamp) {
            nextEntry.timestamp = entry.timestamp;
          }
        }
        const historyContext = entry && entry.historyContext && typeof entry.historyContext === "object" ? entry.historyContext : null;
        if (historyContext) {
          if (!nextEntry.matchBefore && historyContext.matchBefore) {
            nextEntry.matchBefore = cloneData(historyContext.matchBefore);
          }
          if (!nextEntry.scoreBreakdownBefore && historyContext.scoreBreakdownBefore) {
            nextEntry.scoreBreakdownBefore = cloneData(historyContext.scoreBreakdownBefore);
          }
          if (!nextEntry.resumeSkillsBefore && Array.isArray(historyContext.resumeSkillsBefore)) {
            nextEntry.resumeSkillsBefore = historyContext.resumeSkillsBefore.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
          }
        }
        map.set(entry.id, nextEntry);
      });
    }
    return map;
  }, [resumeHistory, changeLog]);
  const availableTemplateOptions = reactExports.useMemo(() => {
    const registry2 = new Map(BASE_TEMPLATE_OPTIONS.map((option) => [option.id, option]));
    const extras = [];
    const register = (value) => {
      const canonical = canonicalizeTemplateId(value);
      if (!canonical || registry2.has(canonical)) {
        return;
      }
      const option = {
        id: canonical,
        name: formatTemplateName(canonical),
        description: "Imported resume template from your previous session."
      };
      registry2.set(canonical, option);
      extras.push(option);
    };
    const templateCandidates = Array.isArray(templateContext == null ? void 0 : templateContext.templates) ? templateContext.templates : [];
    templateCandidates.forEach(register);
    register(templateContext == null ? void 0 : templateContext.template1);
    register(templateContext == null ? void 0 : templateContext.template2);
    register(templateContext == null ? void 0 : templateContext.selectedTemplate);
    register(selectedTemplate);
    return [
      ...BASE_TEMPLATE_OPTIONS,
      ...extras
    ];
  }, [templateContext, selectedTemplate]);
  const selectedTemplateOption = reactExports.useMemo(() => {
    if (!availableTemplateOptions.length)
      return null;
    const canonical = canonicalizeTemplateId(selectedTemplate);
    return availableTemplateOptions.find((option) => option.id === canonical) || availableTemplateOptions.find((option) => option.id === selectedTemplate) || null;
  }, [availableTemplateOptions, selectedTemplate]);
  const isCoverTemplateLinkedToResume = reactExports.useMemo(
    () => (templateContext == null ? void 0 : templateContext.coverTemplateLinkedToResume) !== false,
    [templateContext]
  );
  const selectedCoverTemplate = reactExports.useMemo(() => {
    const fromContext = canonicalizeCoverTemplateId(templateContext == null ? void 0 : templateContext.coverTemplate1);
    if (fromContext) {
      return fromContext;
    }
    return deriveCoverTemplateFromResume(selectedTemplate || DEFAULT_COVER_TEMPLATE);
  }, [selectedTemplate, templateContext]);
  const availableCoverTemplateOptions = reactExports.useMemo(() => {
    const registry2 = new Map(COVER_TEMPLATE_OPTIONS.map((option) => [option.id, option]));
    const extras = [];
    const register = (value) => {
      const canonical = canonicalizeCoverTemplateId(value);
      if (!canonical || registry2.has(canonical)) {
        return;
      }
      const option = {
        id: canonical,
        name: formatCoverTemplateName(canonical),
        description: getCoverTemplateDescription(canonical) || "Imported cover letter template from your previous session."
      };
      registry2.set(canonical, option);
      extras.push(option);
    };
    const templateCandidates = Array.isArray(templateContext == null ? void 0 : templateContext.coverTemplates) ? templateContext.coverTemplates : [];
    templateCandidates.forEach(register);
    register(templateContext == null ? void 0 : templateContext.coverTemplate1);
    register(templateContext == null ? void 0 : templateContext.coverTemplate2);
    register(selectedCoverTemplate);
    register(deriveCoverTemplateFromResume(selectedTemplate || DEFAULT_COVER_TEMPLATE));
    return [...COVER_TEMPLATE_OPTIONS, ...extras];
  }, [templateContext, selectedCoverTemplate, selectedTemplate]);
  const downloadTemplateMetadata = reactExports.useMemo(() => {
    var _a2, _b;
    const canonicalPrimaryTemplate = canonicalizeTemplateId(templateContext == null ? void 0 : templateContext.template1) || canonicalizeTemplateId(templateContext == null ? void 0 : templateContext.selectedTemplate) || canonicalizeTemplateId(selectedTemplate) || "modern";
    const templateCandidates = Array.isArray(templateContext == null ? void 0 : templateContext.templates) ? templateContext.templates.map((tpl) => canonicalizeTemplateId(tpl)).filter(Boolean) : [];
    const canonicalSecondaryTemplateRaw = canonicalizeTemplateId(templateContext == null ? void 0 : templateContext.template2);
    const canonicalSecondaryTemplate = canonicalSecondaryTemplateRaw || templateCandidates.find((tpl) => tpl && tpl !== canonicalPrimaryTemplate) || canonicalPrimaryTemplate;
    const derivedCoverFallback = deriveCoverTemplateFromResume(canonicalPrimaryTemplate);
    const canonicalCoverPrimaryTemplate = canonicalizeCoverTemplateId(
      templateContext == null ? void 0 : templateContext.coverTemplate1,
      derivedCoverFallback
    );
    const coverTemplateCandidates = normalizeCoverTemplateList(templateContext == null ? void 0 : templateContext.coverTemplates);
    let canonicalCoverSecondaryTemplate = canonicalizeCoverTemplateId(
      templateContext == null ? void 0 : templateContext.coverTemplate2
    );
    if (!canonicalCoverSecondaryTemplate || canonicalCoverSecondaryTemplate === canonicalCoverPrimaryTemplate) {
      canonicalCoverSecondaryTemplate = coverTemplateCandidates.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) || COVER_TEMPLATE_IDS.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) || canonicalCoverPrimaryTemplate || derivedCoverFallback;
    }
    const resolvedCoverPrimary = canonicalCoverPrimaryTemplate || derivedCoverFallback || DEFAULT_COVER_TEMPLATE;
    const resolvedCoverSecondary = canonicalCoverSecondaryTemplate || resolvedCoverPrimary || DEFAULT_COVER_TEMPLATE;
    const resumeMetadata = (templateContext && typeof templateContext === "object" ? (_a2 = templateContext.templateMetadata) == null ? void 0 : _a2.resume : null) || {};
    const coverMetadata = (templateContext && typeof templateContext === "object" ? (_b = templateContext.templateMetadata) == null ? void 0 : _b.cover : null) || {};
    const pickResumeName = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatTemplateName(fallbackId) : "";
      return entry && typeof entry.templateName === "string" && entry.templateName.trim() || fallbackName;
    };
    const pickResumeLabel = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatTemplateName(fallbackId) : "";
      const fallbackLabel = fallbackName ? `${fallbackName} Resume` : "Resume Template";
      return entry && typeof entry.templateLabel === "string" && entry.templateLabel.trim() || fallbackLabel;
    };
    const pickCoverName = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatCoverTemplateName(fallbackId) : "Cover Letter";
      return entry && typeof entry.templateName === "string" && entry.templateName.trim() || fallbackName;
    };
    const pickCoverLabel = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatCoverTemplateName(fallbackId) : "Cover Letter";
      return entry && typeof entry.templateLabel === "string" && entry.templateLabel.trim() || fallbackName;
    };
    return {
      original_upload: { id: "original", name: "Original Upload", label: "Original Upload" },
      original_upload_pdf: {
        id: "original_pdf",
        name: "Original Upload (Plain PDF)",
        label: "Original Upload (Plain PDF)"
      },
      version1: {
        id: canonicalPrimaryTemplate,
        name: pickResumeName(resumeMetadata.primary, canonicalPrimaryTemplate),
        label: pickResumeLabel(resumeMetadata.primary, canonicalPrimaryTemplate)
      },
      version2: {
        id: canonicalSecondaryTemplate,
        name: pickResumeName(resumeMetadata.secondary, canonicalSecondaryTemplate),
        label: pickResumeLabel(resumeMetadata.secondary, canonicalSecondaryTemplate)
      },
      cover_letter1: {
        id: resolvedCoverPrimary,
        name: pickCoverName(coverMetadata.primary, resolvedCoverPrimary),
        label: pickCoverLabel(coverMetadata.primary, resolvedCoverPrimary)
      },
      cover_letter2: {
        id: resolvedCoverSecondary,
        name: pickCoverName(coverMetadata.secondary, resolvedCoverSecondary),
        label: pickCoverLabel(coverMetadata.secondary, resolvedCoverSecondary)
      }
    };
  }, [selectedTemplate, templateContext]);
  const downloadTemplateSummaryMessage = reactExports.useMemo(() => {
    const metadata = templateContext && typeof templateContext === "object" ? templateContext.templateMetadata || {} : {};
    const resumeMetadata = (metadata && typeof metadata === "object" ? metadata.resume : null) || {};
    const selectedResumeMeta = (resumeMetadata && typeof resumeMetadata === "object" ? resumeMetadata.selected || resumeMetadata.primary : null) || null;
    const canonicalSelected = canonicalizeTemplateId(selectedResumeMeta == null ? void 0 : selectedResumeMeta.templateId) || canonicalizeTemplateId(
      templateContext && typeof templateContext === "object" ? templateContext.selectedTemplate : ""
    ) || canonicalizeTemplateId(
      templateContext && typeof templateContext === "object" ? templateContext.template1 : ""
    ) || canonicalizeTemplateId(selectedTemplate) || "";
    const baseName = selectedResumeMeta && typeof selectedResumeMeta.templateLabel === "string" && selectedResumeMeta.templateLabel.trim() || selectedResumeMeta && typeof selectedResumeMeta.templateName === "string" && selectedResumeMeta.templateName.trim() || (canonicalSelected ? `${formatTemplateName(canonicalSelected)} Resume` : "");
    if (!baseName && !canonicalSelected) {
      return "";
    }
    const badgeSource = selectedResumeMeta && typeof selectedResumeMeta.templateId === "string" && selectedResumeMeta.templateId.trim() || canonicalSelected || "";
    if (badgeSource) {
      return `You chose: ${baseName} (${badgeSource})`;
    }
    return `You chose: ${baseName}`;
  }, [selectedTemplate, templateContext]);
  const templateHistorySummary = reactExports.useMemo(() => {
    const baseHistory = Array.isArray(templateContext == null ? void 0 : templateContext.templateHistory) ? templateContext.templateHistory.map((item) => canonicalizeTemplateId(item)).filter(Boolean) : [];
    if (!baseHistory.length) {
      return "";
    }
    const history = [...baseHistory];
    const prioritize = (value) => {
      const canonical = canonicalizeTemplateId(value);
      if (!canonical)
        return;
      const index2 = history.indexOf(canonical);
      if (index2 >= 0) {
        history.splice(index2, 1);
      }
      history.unshift(canonical);
    };
    prioritize(templateContext == null ? void 0 : templateContext.selectedTemplate);
    prioritize(selectedTemplate);
    prioritize(templateContext == null ? void 0 : templateContext.template1);
    prioritize(templateContext == null ? void 0 : templateContext.template2);
    const labels = history.map((tpl) => formatTemplateName(tpl)).filter(Boolean);
    if (labels.length <= 1) {
      return "";
    }
    return formatReadableList(labels);
  }, [selectedTemplate, templateContext]);
  reactExports.useEffect(() => {
    if (!templateContext)
      return;
    const canonical = canonicalizeTemplateId(
      templateContext.selectedTemplate || templateContext.template1
    );
    if (canonical && canonical !== selectedTemplate) {
      setSelectedTemplate(canonical);
    }
  }, [templateContext, selectedTemplate]);
  reactExports.useEffect(() => {
    const hasAcceptedEnhanceAll = improvementResults.some(
      (item) => (item == null ? void 0 : item.type) === "enhance-all" && (item == null ? void 0 : item.accepted)
    );
    if (!hasAcceptedEnhanceAll && enhanceAllSummaryText) {
      setEnhanceAllSummaryText("");
    }
  }, [enhanceAllSummaryText, improvementResults]);
  const handleTemplateSelect = reactExports.useCallback(
    (templateId) => {
      const canonical = canonicalizeTemplateId(templateId) || "modern";
      setSelectedTemplate(canonical);
      setTemplateContext((prev) => {
        const base = prev ? { ...prev } : {};
        base.template1 = canonical;
        base.selectedTemplate = canonical;
        const currentList = Array.isArray(prev == null ? void 0 : prev.templates) ? prev.templates.map((item) => canonicalizeTemplateId(item)).filter(Boolean) : [];
        if (!currentList.includes(canonical)) {
          base.templates = [canonical, ...currentList];
        } else {
          const filtered = currentList.filter((item) => item !== canonical);
          base.templates = [canonical, ...filtered];
        }
        const currentHistory = Array.isArray(prev == null ? void 0 : prev.templateHistory) ? prev.templateHistory.map((item) => canonicalizeTemplateId(item)).filter(Boolean) : [];
        if (!currentHistory.includes(canonical)) {
          base.templateHistory = [canonical, ...currentHistory];
        } else {
          const filteredHistory = currentHistory.filter((item) => item !== canonical);
          base.templateHistory = [canonical, ...filteredHistory];
        }
        const shouldLinkCover = base.coverTemplateLinkedToResume !== false;
        const nextContext = ensureCoverTemplateContext(base, canonical, {
          linkCoverToResume: shouldLinkCover
        });
        return decorateTemplateContext(nextContext);
      });
    },
    [setTemplateContext]
  );
  const handleCoverTemplateSelect = reactExports.useCallback(
    (templateId) => {
      const canonical = canonicalizeCoverTemplateId(templateId, DEFAULT_COVER_TEMPLATE);
      setTemplateContext((prev) => {
        const base = prev ? { ...prev } : {};
        base.coverTemplate1 = canonical;
        const existing = normalizeCoverTemplateList(base.coverTemplates);
        const nextTemplates = normalizeCoverTemplateList([canonical, ...existing]);
        base.coverTemplates = nextTemplates;
        const secondary = canonicalizeCoverTemplateId(base.coverTemplate2);
        if (!secondary || secondary === canonical) {
          const fallback = nextTemplates.find((tpl) => tpl !== canonical) || COVER_TEMPLATE_IDS.find((tpl) => tpl !== canonical) || DEFAULT_COVER_TEMPLATE;
          base.coverTemplate2 = fallback;
        } else {
          base.coverTemplate2 = secondary;
        }
        const resumeTemplateForContext = base.selectedTemplate || base.template1 || selectedTemplate || "modern";
        const derivedForResume = deriveCoverTemplateFromResume(resumeTemplateForContext);
        const wasLinked = base.coverTemplateLinkedToResume !== false;
        const shouldStayLinked = wasLinked && canonical === derivedForResume;
        base.coverTemplateLinkedToResume = shouldStayLinked ? true : false;
        const nextContext = ensureCoverTemplateContext(base, resumeTemplateForContext, {
          linkCoverToResume: shouldStayLinked
        });
        return decorateTemplateContext(nextContext);
      });
    },
    [selectedTemplate, setTemplateContext]
  );
  const handleCoverLinkToggle = reactExports.useCallback(
    (shouldLink) => {
      setTemplateContext((prev) => {
        const base = prev ? { ...prev } : {};
        base.coverTemplateLinkedToResume = shouldLink;
        const resumeTemplateForContext = base.selectedTemplate || base.template1 || selectedTemplate || "modern";
        if (shouldLink) {
          base.coverTemplate1 = deriveCoverTemplateFromResume(resumeTemplateForContext);
        }
        const nextContext = ensureCoverTemplateContext(
          base,
          resumeTemplateForContext,
          { linkCoverToResume: shouldLink }
        );
        return decorateTemplateContext(nextContext);
      });
    },
    [selectedTemplate, setTemplateContext]
  );
  const flowSteps = reactExports.useMemo(() => {
    const generationComplete = downloadsReady;
    const downloadComplete = generationComplete && downloadSuccessCount > 0;
    const normalizedErrorMessage = typeof error === "string" ? error.trim() : "";
    const normalizedErrorCode = typeof (errorContext == null ? void 0 : errorContext.code) === "string" ? errorContext.code.trim().toUpperCase() : "";
    const normalizedErrorSource = normalizeServiceSource(errorContext == null ? void 0 : errorContext.source);
    const stageErrorMap = stageErrors && typeof stageErrors === "object" ? stageErrors : createStageErrorState();
    let errorStep = "";
    if (normalizedErrorMessage) {
      if (normalizedErrorCode && SERVICE_ERROR_STEP_BY_CODE[normalizedErrorCode]) {
        errorStep = SERVICE_ERROR_STEP_BY_CODE[normalizedErrorCode];
      } else if (normalizedErrorSource && SERVICE_ERROR_STEP_BY_SOURCE[normalizedErrorSource]) {
        errorStep = SERVICE_ERROR_STEP_BY_SOURCE[normalizedErrorSource];
      }
    }
    const baseSteps = [
      {
        key: "upload",
        label: "Upload",
        description: "Attach your CV and target JD so we can start analysing."
      },
      {
        key: "score",
        label: "Score",
        description: "Review the ATS breakdown and baseline selection chances."
      },
      {
        key: "enhance",
        label: "Enhance",
        description: "Apply targeted rewrites once you understand the current scores."
      },
      {
        key: "generate",
        label: "Generate",
        description: "Produce polished CVs and cover letters tailored to the JD."
      },
      {
        key: "download",
        label: "Download",
        description: "Grab the upgraded CVs and tailored cover letters."
      }
    ];
    let currentAssigned = false;
    return baseSteps.map((step) => {
      const availability = step.key === "upload" ? true : step.key === "score" ? uploadComplete : step.key === "enhance" ? improvementsUnlocked : step.key === "generate" ? improvementsUnlocked && canGenerateEnhancedDocs : step.key === "download" ? generationComplete : false;
      const isComplete = step.key === "upload" ? uploadComplete : step.key === "score" ? scoreComplete : step.key === "enhance" ? canGenerateEnhancedDocs : step.key === "generate" ? generationComplete : step.key === "download" ? downloadComplete : false;
      let status = "upcoming";
      if (isComplete) {
        status = "complete";
      } else if (!currentAssigned && availability) {
        status = "current";
        currentAssigned = true;
      }
      let note = "";
      let noteTone = "";
      switch (step.key) {
        case "upload":
          if (!uploadComplete) {
            if (!hasCvFile) {
              note = "Waiting for your resume upload.";
              noteTone = "info";
            } else if (!hasManualJobDescriptionInput) {
              note = "Must paste JD";
              noteTone = "warning";
            } else {
              note = "Ready to submit for scoring.";
              noteTone = "info";
            }
          } else if (isProcessing && !hasAnalysisData) {
            note = "Uploading & parsing your documents…";
            noteTone = "info";
          } else if (queuedText) {
            note = queuedText;
            noteTone = "info";
          } else if (hasAnalysisData) {
            note = "Upload complete.";
            noteTone = "success";
          }
          break;
        case "score":
          if (isProcessing && !scoreComplete) {
            note = "Scanning resume against the JD…";
            noteTone = "info";
          } else if (resumeExperienceMissing) {
            const prefix = scoreComplete ? "ATS dashboard ready. " : "";
            note = `${prefix}Experience section missing, would you like to auto-generate?`;
            noteTone = "warning";
          } else if (scoreComplete) {
            note = "ATS dashboard ready.";
            noteTone = "success";
          } else if (hasAnalysisData) {
            note = "Waiting for ATS metrics…";
            noteTone = "info";
          }
          break;
        case "enhance":
          if (!improvementsUnlocked) {
            note = "Waiting for ATS validation before unlocking enhancements.";
            noteTone = "info";
          } else if (improvementBusy) {
            note = "Generating AI rewrite…";
            noteTone = "info";
          } else if (resumeExperienceMissing) {
            const suggestionText = improvementCount > 0 ? ` ${improvementCount} suggestion${improvementCount === 1 ? "" : "s"} ready.` : "";
            note = `Experience section missing, would you like to auto-generate?${suggestionText}`;
            noteTone = "warning";
          } else if (improvementCount > 0) {
            note = `${improvementCount} suggestion${improvementCount === 1 ? "" : "s"} ready.`;
            noteTone = "info";
          } else if (improvementsUnlocked) {
            note = "Enhancement options ready when you need them.";
            noteTone = "info";
          }
          break;
        case "generate":
          if (generationComplete) {
            note = `${visibleDownloadCount} file${visibleDownloadCount === 1 ? "" : "s"} generated.`;
            noteTone = "success";
          } else if (isGeneratingDocs) {
            note = "Generating enhanced documents…";
            noteTone = "info";
          } else if (improvementsRequireAcceptance && improvementsUnlocked && (!hasAcceptedImprovement || !acceptedImprovementsValidated)) {
            note = acceptedImprovementsValidated ? "Accept improvements before generating downloads." : "Review JD alignment on accepted improvements before generating downloads.";
            noteTone = "warning";
          } else if (coverLetterContentMissing) {
            note = "Cover letter drafts are blank — open a template to auto-generate personalised text before generating downloads.";
            noteTone = "warning";
          } else if (improvementsUnlocked && canGenerateEnhancedDocs) {
            note = "Generate tailored CVs and cover letters when you are ready.";
            noteTone = "info";
          }
          break;
        case "download":
          if (downloadSuccessCount > 0) {
            note = `${downloadSuccessCount} file${downloadSuccessCount === 1 ? "" : "s"} downloaded.`;
            noteTone = "success";
          } else if (generationComplete) {
            if (coverLetterContentMissing) {
              note = "Cover letter drafts are blank — open a template to auto-generate personalised text before downloading.";
              noteTone = "warning";
            } else {
              note = `${visibleDownloadCount} file${visibleDownloadCount === 1 ? "" : "s"} available.`;
              noteTone = "info";
            }
          } else if (improvementsUnlocked && canGenerateEnhancedDocs) {
            note = "Generate the latest documents to unlock downloads.";
            noteTone = "info";
          }
          break;
      }
      if (note && !noteTone) {
        noteTone = "info";
      }
      const stageErrorValue = (() => {
        const raw = stageErrorMap == null ? void 0 : stageErrorMap[step.key];
        return typeof raw === "string" ? raw.trim() : "";
      })();
      const hasStageError = Boolean(stageErrorValue);
      const isErrorForStage = Boolean(
        !hasStageError && errorStep && normalizedErrorMessage && errorStep === step.key
      );
      if (hasStageError) {
        note = stageErrorValue;
        noteTone = "warning";
      } else if (isErrorForStage) {
        note = normalizedErrorMessage;
        noteTone = "warning";
      }
      const isActiveStage = status === "current";
      if (!isActiveStage && !hasStageError && !isErrorForStage) {
        note = "";
        noteTone = "";
      }
      return { ...step, status, note, noteTone };
    });
  }, [
    changeCount,
    canGenerateEnhancedDocs,
    coverLetterContentMissing,
    acceptedImprovementsValidated,
    downloadsReady,
    error,
    errorContext,
    stageErrors,
    hasAnalysisData,
    hasCvFile,
    hasManualJobDescriptionInput,
    hasAcceptedImprovement,
    improvementBusy,
    improvementCount,
    improvementsRequireAcceptance,
    improvementsUnlocked,
    isProcessing,
    isGeneratingDocs,
    queuedText,
    resumeExperienceMissing,
    scoreComplete,
    uploadComplete,
    visibleDownloadCount,
    downloadSuccessCount
  ]);
  const currentPhase = reactExports.useMemo(() => {
    const currentStep = flowSteps.find((step) => step.status === "current");
    if (currentStep) {
      return currentStep.key;
    }
    const completedSteps = flowSteps.filter((step) => step.status === "complete");
    if (completedSteps.length > 0) {
      return completedSteps[completedSteps.length - 1].key;
    }
    return "upload";
  }, [flowSteps]);
  const handleExportErrorLog = reactExports.useCallback(() => {
    if (!error) {
      return;
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
      setQueuedMessage("Error log export is not supported in this environment.");
      return;
    }
    try {
      const normalizedSource = normalizeServiceSource(errorContext == null ? void 0 : errorContext.source);
      const downloadStateSnapshot = Object.entries(downloadStates || {}).reduce(
        (acc, [key, value = {}]) => {
          const stateStatus = typeof (value == null ? void 0 : value.status) === "string" ? value.status : "";
          const stateError = typeof (value == null ? void 0 : value.error) === "string" ? value.error : "";
          if (stateStatus || stateError) {
            acc[key] = {
              status: stateStatus,
              error: stateError
            };
          }
          return acc;
        },
        {}
      );
      const flowSnapshot = Array.isArray(flowSteps) ? flowSteps.map((step) => ({
        key: step.key,
        status: step.status,
        note: step.note || "",
        noteTone: step.noteTone || ""
      })) : [];
      const stageErrorSnapshot = Object.entries(stageErrors || {}).reduce(
        (acc, [key, value]) => {
          if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed) {
              acc[key] = trimmed;
            }
          }
          return acc;
        },
        {}
      );
      const navigatorInfo = typeof navigator === "object" && navigator ? {
        userAgent: typeof navigator.userAgent === "string" ? navigator.userAgent : "",
        language: typeof navigator.language === "string" ? navigator.language : "",
        platform: typeof navigator.platform === "string" ? navigator.platform : ""
      } : {
        userAgent: "",
        language: "",
        platform: ""
      };
      const payload = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: error,
        recovery: errorRecovery || "",
        errorCode: typeof (errorContext == null ? void 0 : errorContext.code) === "string" ? errorContext.code : "",
        errorSource: normalizedSource || "",
        jobId: jobId || "",
        requestId: typeof (errorContext == null ? void 0 : errorContext.requestId) === "string" ? errorContext.requestId : "",
        currentPhase,
        activeDashboardStage,
        isProcessing,
        hasCvFile,
        hasManualJobDescriptionInput,
        queuedMessage,
        logs: errorLogs.length ? errorLogs : void 0,
        downloadStates: Object.keys(downloadStateSnapshot).length ? downloadStateSnapshot : void 0,
        stageErrors: Object.keys(stageErrorSnapshot).length ? stageErrorSnapshot : void 0,
        flow: flowSnapshot,
        environment: navigatorInfo
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      link.href = url;
      link.download = `resumeforge-error-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1e3);
    } catch (err) {
      console.error("Error log export failed", err);
      setQueuedMessage("Unable to export the error log. Please try again.");
    }
  }, [
    activeDashboardStage,
    currentPhase,
    downloadStates,
    error,
    errorContext,
    errorRecovery,
    errorLogs,
    flowSteps,
    hasCvFile,
    hasManualJobDescriptionInput,
    isProcessing,
    jobId,
    stageErrors,
    queuedMessage,
    setQueuedMessage
  ]);
  const downloadGroups = reactExports.useMemo(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      return { resume: [], cover: [], other: [] };
    }
    const resume = [];
    const cover = [];
    const other = [];
    const resumeOrder = { original_upload: 0, original_upload_pdf: 1, version1: 2, version2: 3 };
    const coverOrder = { cover_letter1: 0, cover_letter2: 1 };
    outputFiles.forEach((file) => {
      if (!file || typeof file !== "object")
        return;
      const presentation = getDownloadPresentation(file);
      const resolvedTemplateMeta = (() => {
        if (file.templateMeta && typeof file.templateMeta === "object") {
          const candidateName = typeof file.templateMeta.name === "string" ? file.templateMeta.name.trim() : "";
          const candidateId = typeof file.templateMeta.id === "string" ? file.templateMeta.id.trim() : "";
          if (candidateName || candidateId) {
            return {
              ...file.templateMeta,
              id: candidateId,
              name: candidateName || (presentation.category === "cover" ? formatCoverTemplateName(candidateId) : formatTemplateName(candidateId))
            };
          }
        }
        const rawTemplateId = typeof file.templateId === "string" && file.templateId.trim() || typeof file.template === "string" && file.template.trim() || "";
        const rawTemplateName = typeof file.templateName === "string" ? file.templateName.trim() : "";
        if (rawTemplateName || rawTemplateId) {
          const derivedName = rawTemplateName || (presentation.category === "cover" ? formatCoverTemplateName(rawTemplateId) : formatTemplateName(rawTemplateId));
          return { id: rawTemplateId, name: derivedName };
        }
        return downloadTemplateMetadata[file.type] || null;
      })();
      const entry = {
        ...file,
        presentation,
        templateMeta: resolvedTemplateMeta,
        generatedAt: file.generatedAt || downloadGeneratedAt || ""
      };
      if (presentation.category === "resume") {
        resume.push(entry);
      } else if (presentation.category === "cover") {
        cover.push(entry);
      } else {
        other.push(entry);
      }
    });
    resume.sort((a, b) => (resumeOrder[a.type] ?? 50) - (resumeOrder[b.type] ?? 50));
    cover.sort((a, b) => (coverOrder[a.type] ?? 50) - (coverOrder[b.type] ?? 50));
    other.sort((a, b) => (a.presentation.label || "").localeCompare(b.presentation.label || ""));
    return { resume, cover, other };
  }, [outputFiles, downloadTemplateMetadata, downloadGeneratedAt]);
  const resumeDownloadsByTemplate = reactExports.useMemo(() => {
    if (!downloadGroups.resume.length) {
      return {};
    }
    return downloadGroups.resume.reduce((acc, file) => {
      var _a2, _b;
      if (!file || typeof file !== "object") {
        return acc;
      }
      const templateCandidates = [
        (_a2 = file.templateMeta) == null ? void 0 : _a2.id,
        file.templateId,
        file.template,
        (_b = file.presentation) == null ? void 0 : _b.templateId
      ];
      const templateId = templateCandidates.map((candidate) => canonicalizeTemplateId(candidate)).find(Boolean);
      if (!templateId) {
        return acc;
      }
      const existing = acc[templateId] || [];
      acc[templateId] = [...existing, file];
      return acc;
    }, {});
  }, [downloadGroups.resume]);
  const coverDownloadsByTemplate = reactExports.useMemo(() => {
    if (!downloadGroups.cover.length) {
      return {};
    }
    return downloadGroups.cover.reduce((acc, file) => {
      var _a2;
      if (!file || typeof file !== "object") {
        return acc;
      }
      const templateCandidates = [
        (_a2 = file.templateMeta) == null ? void 0 : _a2.id,
        file.coverTemplateId,
        file.templateId,
        file.template
      ];
      const templateId = templateCandidates.map((candidate) => canonicalizeCoverTemplateId(candidate)).find(Boolean);
      if (!templateId) {
        return acc;
      }
      const existing = acc[templateId] || [];
      acc[templateId] = [...existing, file];
      return acc;
    }, {});
  }, [downloadGroups.cover]);
  reactExports.useEffect(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      setDownloadStates({});
      setIsGeneratingDocs(false);
      setIsCoverLetterDownloading(false);
      return;
    }
    const now = Date.now();
    setDownloadStates((prev) => {
      const nextStates = {};
      outputFiles.forEach((file) => {
        if (!file || typeof file !== "object") {
          return;
        }
        const stateKey = getDownloadStateKey(file);
        if (!stateKey) {
          return;
        }
        const downloadUrl = typeof file.url === "string" ? file.url.trim() : "";
        const expiresAtValue = typeof file.expiresAt === "string" ? file.expiresAt.trim() : "";
        const storageKey = typeof file.storageKey === "string" ? file.storageKey.trim() : "";
        let errorMessage = "";
        if (!downloadUrl) {
          errorMessage = "Download link unavailable. Please regenerate the document.";
        } else if (expiresAtValue) {
          const expiryDate = new Date(expiresAtValue);
          if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() <= now) {
            errorMessage = storageKey ? "This link expired. Select Download to refresh it automatically." : "This link has expired. Regenerate the documents to refresh the download link.";
          }
        }
        const previousState = prev && typeof prev === "object" ? prev[stateKey] : void 0;
        if (previousState && previousState.status === "completed" && !errorMessage) {
          nextStates[stateKey] = previousState;
        } else {
          nextStates[stateKey] = { status: "idle", error: errorMessage };
        }
      });
      return nextStates;
    });
    setIsGeneratingDocs(false);
    setIsCoverLetterDownloading(false);
  }, [outputFiles]);
  reactExports.useEffect(() => {
    setCoverLetterReviewState({});
  }, [outputFiles]);
  reactExports.useEffect(() => {
    if (typeof window === "undefined") {
      return void 0;
    }
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      return void 0;
    }
    const parseTimestamp = (value) => {
      if (!value)
        return 0;
      if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isNaN(ms) ? 0 : ms;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return value > 1e12 ? value : value * 1e3;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
          return 0;
        }
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
          return numeric > 1e12 ? numeric : numeric * 1e3;
        }
        const date = new Date(trimmed);
        const ms = date.getTime();
        return Number.isNaN(ms) ? 0 : ms;
      }
      return 0;
    };
    const pruneExpiredDownloads = () => {
      let removedAny = false;
      let removedAll = false;
      setOutputFiles((current) => {
        if (!Array.isArray(current) || current.length === 0) {
          return current;
        }
        const now = Date.now();
        const filtered = current.filter((entry) => {
          if (!entry || typeof entry !== "object") {
            return false;
          }
          const expiresAtMs = parseTimestamp(entry.expiresAt);
          if (expiresAtMs) {
            return expiresAtMs > now;
          }
          const generatedAtMs = parseTimestamp(entry.generatedAt);
          if (generatedAtMs) {
            return generatedAtMs + DOWNLOAD_SESSION_RETENTION_MS > now;
          }
          return true;
        });
        if (filtered.length === current.length) {
          return current;
        }
        removedAny = true;
        if (filtered.length === 0) {
          removedAll = true;
        }
        return filtered;
      });
      if (removedAny && removedAll) {
        setDownloadGeneratedAt("");
        setPreviewFile(null);
        setPendingDownloadFile(null);
        setQueuedMessage(DOWNLOAD_SESSION_EXPIRED_MESSAGE);
      }
    };
    pruneExpiredDownloads();
    const intervalId = window.setInterval(pruneExpiredDownloads, DOWNLOAD_SESSION_POLL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    outputFiles,
    setDownloadGeneratedAt,
    setPendingDownloadFile,
    setPreviewFile,
    setQueuedMessage,
    setOutputFiles
  ]);
  const handleCoverLetterTextChange = reactExports.useCallback(
    (type, value) => {
      if (!isCoverLetterType(type))
        return;
      setCoverLetterDrafts((prev) => ({ ...prev, [type]: value }));
      setCoverLetterClipboardStatus("");
      setCoverLetterDownloadError("");
    },
    []
  );
  const markCoverLetterPreviewed = reactExports.useCallback((type) => {
    if (!isCoverLetterType(type))
      return;
    setCoverLetterReviewState((prev) => {
      if (prev == null ? void 0 : prev[type]) {
        return prev;
      }
      return { ...prev, [type]: true };
    });
  }, []);
  const resetCoverLetterDraft = reactExports.useCallback(
    (type) => {
      if (!isCoverLetterType(type))
        return;
      setCoverLetterDrafts((prev) => ({ ...prev, [type]: coverLetterOriginals[type] ?? "" }));
      setCoverLetterClipboardStatus("");
      setCoverLetterDownloadError("");
    },
    [coverLetterOriginals]
  );
  const handleCopyCoverLetter = reactExports.useCallback(
    async (type, file = {}) => {
      var _a2;
      if (!isCoverLetterType(type))
        return;
      const resolvedText = resolveCoverLetterDraftText(
        coverLetterDrafts,
        coverLetterOriginals,
        type,
        file
      );
      const text = typeof resolvedText === "string" ? resolvedText.trim() : "";
      if (!text) {
        setCoverLetterClipboardStatus("Add personalised text before copying.");
        return;
      }
      try {
        if ((_a2 = navigator == null ? void 0 : navigator.clipboard) == null ? void 0 : _a2.writeText) {
          await navigator.clipboard.writeText(text);
          setCoverLetterClipboardStatus("Copied to clipboard!");
        } else {
          setCoverLetterClipboardStatus("Copy not supported in this browser.");
        }
      } catch (err) {
        console.error("Copy cover letter failed", err);
        setCoverLetterClipboardStatus("Copy failed. Select the text and copy manually.");
      }
    },
    [coverLetterDrafts, coverLetterOriginals]
  );
  const handleDownloadEditedCoverLetter = reactExports.useCallback(async () => {
    var _a2, _b;
    if (!coverLetterEditor || !isCoverLetterType(coverLetterEditor.type)) {
      return;
    }
    if (typeof window === "undefined") {
      setCoverLetterDownloadError("PDF download is not supported in this environment.");
      return;
    }
    const type = coverLetterEditor.type;
    const file = coverLetterEditor.file || {};
    const resolvedDraftText = resolveCoverLetterDraftText(
      coverLetterDrafts,
      coverLetterOriginals,
      type,
      file
    );
    const text = typeof resolvedDraftText === "string" ? resolvedDraftText.trim() : "";
    if (!text) {
      setCoverLetterDownloadError("Add your personalised message before downloading.");
      return;
    }
    const presentation = coverLetterEditor.presentation || getDownloadPresentation(file);
    const { templateId: resolvedTemplateId, templateName: resolvedTemplateName, candidates: coverTemplateCandidates } = resolveCoverTemplateSelection({
      file,
      type,
      downloadTemplateMetadata,
      templateContext
    });
    const coverLetterFields = file.coverLetterFields && typeof file.coverLetterFields === "object" ? file.coverLetterFields : null;
    const sanitizeContactLines = (lines = []) => Array.isArray(lines) ? lines.filter(
      (line) => typeof line === "string" && line.trim() && !/linkedin/i.test(line) && !/credly/i.test(line) && !/\bjd\b/i.test(line)
    ) : [];
    const contactDetails = coverLetterFields && typeof coverLetterFields.contact === "object" ? {
      contactLines: sanitizeContactLines(coverLetterFields.contact.lines),
      email: typeof coverLetterFields.contact.email === "string" ? coverLetterFields.contact.email : "",
      phone: typeof coverLetterFields.contact.phone === "string" ? coverLetterFields.contact.phone : "",
      cityState: typeof coverLetterFields.contact.location === "string" ? coverLetterFields.contact.location : ""
    } : void 0;
    const sanitizedCoverLetterFields = (() => {
      if (!coverLetterFields || typeof coverLetterFields !== "object") {
        return void 0;
      }
      const sanitizedContact = contactDetails ? {
        ...coverLetterFields.contact,
        lines: contactDetails.contactLines,
        linkedin: ""
      } : void 0;
      return {
        ...coverLetterFields,
        contact: sanitizedContact
      };
    })();
    const applicantName = typeof ((_a2 = coverLetterFields == null ? void 0 : coverLetterFields.closing) == null ? void 0 : _a2.signature) === "string" && coverLetterFields.closing.signature.trim() || "";
    const jobTitle = typeof ((_b = coverLetterFields == null ? void 0 : coverLetterFields.job) == null ? void 0 : _b.title) === "string" && coverLetterFields.job.title.trim() || (typeof (changeLogSummaryContext == null ? void 0 : changeLogSummaryContext.jobTitle) === "string" ? changeLogSummaryContext.jobTitle : "");
    const payload = {
      jobId,
      text,
      templateId: resolvedTemplateId,
      template: resolvedTemplateId,
      coverTemplate: resolvedTemplateId,
      coverTemplateId: resolvedTemplateId,
      coverTemplates: coverTemplateCandidates,
      templates: coverTemplateCandidates,
      variant: type,
      letterIndex: type === "cover_letter2" ? 2 : 1,
      jobTitle,
      jobDescription: jobDescriptionText,
      jobSkills,
      applicantName,
      ...contactDetails ? { contactDetails } : {},
      ...sanitizedCoverLetterFields ? { coverLetterFields: sanitizedCoverLetterFields } : {},
      ...userIdentifier ? { userId: userIdentifier } : {}
    };
    setIsCoverLetterDownloading(true);
    setCoverLetterDownloadError("");
    try {
      const response = await fetch(buildApiUrl(API_BASE_URL, "/api/render-cover-letter"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        let errPayload = null;
        try {
          errPayload = await response.json();
        } catch (parseErr) {
          errPayload = null;
        }
        const errorMessages = extractServerMessages(errPayload);
        const summaryMessage = errorMessages.length > 0 ? errorMessages[errorMessages.length - 1] : "";
        const { message, code, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: "Could not generate PDF, please try again.",
          status: response.status
        });
        const error2 = new Error(message);
        if (code) {
          error2.code = code;
        }
        if (source) {
          error2.serviceError = source;
        }
        if (requestId) {
          error2.requestId = requestId;
        }
        if (logs && logs.length) {
          error2.logs = logs;
        }
        if (summaryMessage) {
          error2.summary = summaryMessage;
        }
        if (errorMessages.length > 0) {
          error2.messages = errorMessages;
        }
        throw error2;
      }
      const data = await response.json();
      const headerTemplateId = response.headers.get("x-template-id");
      const headerTemplateName = response.headers.get("x-template-name");
      const effectiveTemplateId = canonicalizeCoverTemplateId(
        (data == null ? void 0 : data.templateId) || headerTemplateId || resolvedTemplateId,
        resolvedTemplateId
      );
      const effectiveTemplateName = typeof (data == null ? void 0 : data.templateName) === "string" && data.templateName.trim() || headerTemplateName && headerTemplateName.trim() || resolvedTemplateName || formatCoverTemplateName(effectiveTemplateId);
      const rawDownloadUrlCandidates = [
        data == null ? void 0 : data.downloadUrl,
        data == null ? void 0 : data.signedUrl,
        data == null ? void 0 : data.fileUrl,
        data == null ? void 0 : data.url,
        data == null ? void 0 : data.typeUrl
      ];
      const downloadUrl = rawDownloadUrlCandidates.find(
        (value) => typeof value === "string" && value.trim()
      );
      if (!downloadUrl) {
        throw new Error("Download link was not provided by the server.");
      }
      const fileForName = {
        type,
        fileName: coverLetterEditor.label || type || "cover-letter",
        url: downloadUrl,
        templateId: effectiveTemplateId,
        templateName: effectiveTemplateName,
        coverTemplateId: effectiveTemplateId,
        coverTemplateName: effectiveTemplateName
      };
      const downloadFileName = deriveDownloadFileName(fileForName, presentation, null, {
        templateName: effectiveTemplateName,
        templateId: effectiveTemplateId,
        generatedAt: typeof (data == null ? void 0 : data.generatedAt) === "string" && Date.parse(data.generatedAt) || Date.now(),
        contentTypeOverride: "application/pdf",
        forcePdfExtension: true
      });
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.rel = "noopener";
      link.target = "_blank";
      if (downloadFileName) {
        link.download = downloadFileName;
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      resetUiAfterDownload();
    } catch (err) {
      console.error("Cover letter PDF generation failed", err);
      const summary = typeof (err == null ? void 0 : err.summary) === "string" && err.summary.trim() ? err.summary.trim() : "";
      const message = summary || typeof (err == null ? void 0 : err.message) === "string" && err.message.trim() || "Could not generate PDF, please try again";
      setCoverLetterDownloadError(message);
    } finally {
      setIsCoverLetterDownloading(false);
    }
  }, [
    API_BASE_URL,
    changeLogSummaryContext,
    coverLetterDrafts,
    coverLetterOriginals,
    coverLetterEditor,
    downloadTemplateMetadata,
    jobDescriptionText,
    jobId,
    jobSkills,
    resetUiAfterDownload,
    templateContext,
    userIdentifier
  ]);
  const openCoverLetterEditorModal = reactExports.useCallback(
    (file) => {
      if (!file || !isCoverLetterType(file.type))
        return;
      const presentation = file.presentation || getDownloadPresentation(file);
      markCoverLetterPreviewed(file.type);
      setCoverLetterEditor({
        type: file.type,
        label: presentation.label,
        presentation,
        file
      });
      setCoverLetterDownloadError("");
      setCoverLetterClipboardStatus("");
    },
    [markCoverLetterPreviewed, setCoverLetterEditor, setCoverLetterDownloadError, setCoverLetterClipboardStatus]
  );
  const closeCoverLetterEditor = reactExports.useCallback(() => {
    setCoverLetterEditor(null);
    setCoverLetterDownloadError("");
    setCoverLetterClipboardStatus("");
  }, []);
  const openDownloadPreview = reactExports.useCallback(
    (file, { requireDownloadConfirmation = false } = {}) => {
      if (!file)
        return;
      const presentation = file.presentation || getDownloadPresentation(file);
      if (presentation.category === "cover" && isCoverLetterType(file.type)) {
        openCoverLetterEditorModal({ ...file, presentation });
        return;
      }
      if (requireDownloadConfirmation) {
        setPendingDownloadFile({ ...file, presentation });
      } else {
        setPendingDownloadFile(null);
      }
      setPreviewFile({ ...file, presentation });
    },
    [openCoverLetterEditorModal]
  );
  const closeDownloadPreview = reactExports.useCallback(() => {
    setPreviewFile(null);
    setPendingDownloadFile(null);
  }, []);
  const renderTemplateSelection = (context = "improvements") => {
    const showDownloadActions = context === "downloads";
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      TemplatePicker,
      {
        context,
        resumeOptions: availableTemplateOptions,
        resumeHistorySummary: templateHistorySummary,
        selectedResumeTemplateId: selectedTemplate,
        selectedResumeTemplateName: formatTemplateName(selectedTemplate),
        selectedResumeTemplateDescription: (selectedTemplateOption == null ? void 0 : selectedTemplateOption.description) || "",
        onResumeTemplateSelect: handleTemplateSelect,
        coverOptions: availableCoverTemplateOptions,
        selectedCoverTemplateId: selectedCoverTemplate,
        selectedCoverTemplateName: formatCoverTemplateName(selectedCoverTemplate),
        selectedCoverTemplateDescription: getCoverTemplateDescription(selectedCoverTemplate),
        onCoverTemplateSelect: handleCoverTemplateSelect,
        isCoverLinkedToResume: isCoverTemplateLinkedToResume,
        onCoverLinkToggle: handleCoverLinkToggle,
        disabled: isProcessing,
        isApplying: isProcessing,
        showDownloadActions,
        resumeDownloadsByTemplate: showDownloadActions ? resumeDownloadsByTemplate : void 0,
        coverDownloadsByTemplate: showDownloadActions ? coverDownloadsByTemplate : void 0,
        onDownloadPreview: showDownloadActions ? openDownloadPreview : void 0
      }
    );
  };
  const refreshDownloadLink = reactExports.useCallback(
    async (file, { silent = false } = {}) => {
      const fallbackMessage = "Unable to refresh the download link. Please try again.";
      if (!file || typeof file !== "object") {
        if (!silent) {
          setError("Download link is unavailable. Please regenerate the document.", {
            stage: "download"
          });
        }
        const err = new Error("DOWNLOAD_ENTRY_INVALID");
        err.message = "Download link is unavailable. Please regenerate the document.";
        throw err;
      }
      const storageKey = typeof file.storageKey === "string" ? file.storageKey.trim() : "";
      if (!storageKey) {
        if (!silent) {
          setError("Download link is unavailable. Please regenerate the document.", {
            stage: "download"
          });
        }
        const err = new Error("DOWNLOAD_KEY_MISSING");
        err.message = "Download link is unavailable. Please regenerate the document.";
        throw err;
      }
      if (!silent) {
        setError("", { stage: "download" });
      }
      if (!jobId) {
        if (!silent) {
          setError("Upload your resume and job description before generating downloads.", {
            stage: "download"
          });
        }
        const err = new Error("JOB_ID_REQUIRED");
        err.message = "Upload your resume and job description before generating downloads.";
        throw err;
      }
      const payload = { jobId, storageKey };
      if (typeof file.type === "string" && file.type.trim()) {
        payload.type = file.type.trim();
      }
      if (userIdentifier) {
        payload.userId = userIdentifier;
      }
      let response;
      try {
        response = await fetch(
          buildApiUrl(API_BASE_URL, "/api/refresh-download-link"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );
      } catch (err) {
        if (!silent) {
          setError(fallbackMessage, { stage: "download" });
        }
        const error2 = err instanceof Error ? err : new Error(fallbackMessage);
        if (!error2.message) {
          error2.message = fallbackMessage;
        }
        throw error2;
      }
      const data = await response.json().catch(() => ({}));
      const {
        message: errorMessage,
        code: errorCode,
        source: errorSource,
        logs: errorLogsValue,
        requestId: errorRequestId
      } = resolveApiError({
        data,
        fallback: fallbackMessage,
        status: response.status
      });
      if (!response.ok) {
        if (!silent) {
          setError(errorMessage, {
            serviceError: errorSource,
            errorCode,
            logs: errorLogsValue,
            requestId: errorRequestId,
            stage: "download"
          });
        }
        const err = new Error(errorMessage);
        err.code = errorCode || "DOWNLOAD_REFRESH_FAILED";
        if (errorSource) {
          err.serviceError = errorSource;
        }
        if (errorRequestId) {
          err.requestId = errorRequestId;
        }
        if (Array.isArray(errorLogsValue) && errorLogsValue.length) {
          err.logs = errorLogsValue;
        }
        throw err;
      }
      const refreshedUrl = typeof data.url === "string" ? data.url.trim() : "";
      if (!refreshedUrl) {
        const message = "Download link is unavailable after refresh. Please regenerate the document.";
        if (!silent) {
          setError(message, { stage: "download" });
        }
        const err = new Error(message);
        err.code = "DOWNLOAD_URL_MISSING";
        throw err;
      }
      const refreshedExpiresAt = typeof data.expiresAt === "string" ? data.expiresAt.trim() : "";
      const refreshedAtIso = (/* @__PURE__ */ new Date()).toISOString();
      const typeFragment = typeof file.type === "string" && file.type.trim() || "download";
      const updatedFields = {
        url: refreshedUrl,
        fileUrl: refreshedUrl,
        typeUrl: `${refreshedUrl}#${encodeURIComponent(typeFragment)}`,
        expiresAt: refreshedExpiresAt,
        refreshedAt: refreshedAtIso,
        storageKey
      };
      let refreshedEntry = null;
      setOutputFiles((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) {
          return prev;
        }
        let changed = false;
        const next = prev.map((entry) => {
          if (!entry || typeof entry !== "object")
            return entry;
          const entryKey = typeof entry.storageKey === "string" ? entry.storageKey.trim() : "";
          const matchesKey = entryKey && entryKey === storageKey;
          const matchesType = !entryKey && entry.type === file.type;
          if (!matchesKey && !matchesType) {
            return entry;
          }
          changed = true;
          const merged = { ...entry, ...updatedFields };
          refreshedEntry = merged;
          return merged;
        });
        return changed ? next : prev;
      });
      setPreviewFile((prev) => {
        if (!prev || typeof prev !== "object")
          return prev;
        const entryKey = typeof prev.storageKey === "string" ? prev.storageKey.trim() : "";
        const matchesKey = entryKey && entryKey === storageKey;
        const matchesType = !entryKey && prev.type === file.type;
        if (!matchesKey && !matchesType) {
          return prev;
        }
        return { ...prev, ...updatedFields };
      });
      setPendingDownloadFile((prev) => {
        if (!prev || typeof prev !== "object")
          return prev;
        const entryKey = typeof prev.storageKey === "string" ? prev.storageKey.trim() : "";
        const matchesKey = entryKey && entryKey === storageKey;
        const matchesType = !entryKey && prev.type === file.type;
        if (!matchesKey && !matchesType) {
          return prev;
        }
        return { ...prev, ...updatedFields };
      });
      if (!refreshedEntry) {
        refreshedEntry = { ...file, ...updatedFields };
      }
      return refreshedEntry;
    },
    [API_BASE_URL, jobId, userIdentifier, setError, setOutputFiles, setPreviewFile, setPendingDownloadFile]
  );
  const handleDownloadFile = reactExports.useCallback(
    async (file) => {
      var _a2, _b, _c;
      if (!file || typeof file !== "object") {
        setError("Unable to download this document. Please try again.", {
          stage: "download"
        });
        return;
      }
      let activeFile = file;
      setError("", { stage: "download" });
      const presentation = activeFile.presentation || getDownloadPresentation(activeFile);
      if (typeof window === "undefined" || typeof document === "undefined") {
        setError("Download is not supported in this environment.", { stage: "download" });
        return;
      }
      const stateKeyBase = getDownloadStateKey(activeFile);
      let downloadUrl = typeof activeFile.url === "string" ? activeFile.url.trim() : "";
      let expiresAtIso = typeof activeFile.expiresAt === "string" ? activeFile.expiresAt.trim() : "";
      const storageKey = typeof activeFile.storageKey === "string" ? activeFile.storageKey.trim() : "";
      const canRefresh = Boolean(storageKey);
      const computeIsExpired = (value) => {
        if (!value)
          return false;
        const expiryDate = new Date(value);
        if (Number.isNaN(expiryDate.getTime())) {
          return false;
        }
        return expiryDate.getTime() <= Date.now();
      };
      let isExpired = computeIsExpired(expiresAtIso);
      if ((!downloadUrl || isExpired) && canRefresh) {
        try {
          const refreshed = await refreshDownloadLink(activeFile, { silent: true });
          if (refreshed && typeof refreshed === "object") {
            activeFile = { ...activeFile, ...refreshed };
            downloadUrl = typeof activeFile.url === "string" ? activeFile.url.trim() : "";
            expiresAtIso = typeof activeFile.expiresAt === "string" ? activeFile.expiresAt.trim() : "";
            isExpired = computeIsExpired(expiresAtIso);
          }
        } catch (refreshErr) {
          const refreshMessage = (refreshErr == null ? void 0 : refreshErr.message) || "Unable to refresh the download link. Please try again.";
          setError(refreshMessage, { stage: "download" });
          if (stateKeyBase) {
            setDownloadStates((prev) => ({
              ...prev,
              [stateKeyBase]: {
                status: "idle",
                error: "Download link expired. Try refreshing again."
              }
            }));
          }
          setPendingDownloadFile(null);
          return;
        }
      }
      if (!downloadUrl) {
        setError("Download link is unavailable. Please regenerate the document.", {
          stage: "download"
        });
        if (stateKeyBase) {
          setDownloadStates((prev) => ({
            ...prev,
            [stateKeyBase]: { status: "idle", error: "Download link unavailable." }
          }));
        }
        return;
      }
      const stateKey = stateKeyBase || downloadUrl;
      const previewStateKey = previewFile ? getDownloadStateKey(previewFile) || (typeof previewFile.url === "string" ? previewFile.url : "") : "";
      if (previewStateKey !== stateKey) {
        openDownloadPreview(activeFile, { requireDownloadConfirmation: true });
        return;
      }
      setDownloadStates((prev) => ({
        ...prev,
        [stateKey]: { status: "loading", error: "" }
      }));
      try {
        const normalizedDownloadUrl = downloadUrl;
        const shouldStreamInBrowser = (() => {
          if (normalizedDownloadUrl.startsWith("blob:") || normalizedDownloadUrl.startsWith("data:")) {
            return true;
          }
          return isSameOriginUrl(normalizedDownloadUrl);
        })();
        if (!shouldStreamInBrowser) {
          const opened = openUrlInNewTab(normalizedDownloadUrl);
          if (!opened) {
            throw new Error("Direct download open failed");
          }
          setDownloadStates((prev) => ({
            ...prev,
            [stateKey]: { status: "completed", error: "" }
          }));
          setPendingDownloadFile(null);
          resetUiAfterDownload();
          return;
        }
        const response = await fetch(normalizedDownloadUrl);
        if (!response.ok) {
          const downloadError = new Error(`Download failed with status ${response.status}`);
          downloadError.status = response.status;
          if (response.status === 404) {
            downloadError.code = "DOWNLOAD_NOT_FOUND";
          }
          throw downloadError;
        }
        const responseContentType = ((_b = (_a2 = response.headers) == null ? void 0 : _a2.get) == null ? void 0 : _b.call(_a2, "content-type")) || "";
        const normalizedResponseType = ((_c = responseContentType.split(";")[0]) == null ? void 0 : _c.trim().toLowerCase()) || "";
        const rawBlob = await response.blob();
        const typeHint = typeof activeFile.type === "string" ? activeFile.type.trim().toLowerCase() : "";
        const storageExtension = extractFileExtension(storageKey);
        const urlExtension = extractFileExtension(activeFile.url);
        const fileNameExtension = extractFileExtension(activeFile.fileName);
        const expectsPdfByType = Boolean(typeHint && typeHint !== "original_upload");
        const expectsPdfByExtension = storageExtension === ".pdf" || urlExtension === ".pdf" || fileNameExtension === ".pdf";
        const expectsPdfByHeader = normalizedResponseType.includes("pdf");
        const shouldNormalizePdf = expectsPdfByType || expectsPdfByExtension || expectsPdfByHeader;
        let downloadBlob = rawBlob;
        let normalizedContentType = normalizedResponseType || responseContentType;
        const hasDocxExtension = storageExtension === ".docx" || urlExtension === ".docx" || fileNameExtension === ".docx";
        const hasDocExtension = storageExtension === ".doc" || urlExtension === ".doc" || fileNameExtension === ".doc";
        if (shouldNormalizePdf) {
          const normalizedPdf = await normalizePdfBlob(rawBlob, { contentType: responseContentType });
          downloadBlob = normalizedPdf.blob;
          normalizedContentType = normalizedPdf.contentType || normalizedContentType || "application/pdf";
        } else if ((!normalizedContentType || normalizedContentType === "application/octet-stream" || normalizedContentType === "binary/octet-stream") && (hasDocxExtension || hasDocExtension)) {
          normalizedContentType = hasDocxExtension ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/msword";
        }
        const templateMeta = activeFile.templateMeta || downloadTemplateMetadata[activeFile.type] || {};
        const fileTimestamp = activeFile.generatedAt || downloadGeneratedAt || Date.now();
        const fileName = deriveDownloadFileName(activeFile, presentation, response, {
          templateName: templateMeta.name,
          templateId: templateMeta.id,
          generatedAt: fileTimestamp,
          contentTypeOverride: normalizedContentType,
          forcePdfExtension: shouldNormalizePdf,
          versionId: activeFile.versionId,
          versionHash: activeFile.versionHash
        });
        const blobUrl = URL.createObjectURL(downloadBlob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        setDownloadStates((prev) => ({
          ...prev,
          [stateKey]: { status: "completed", error: "" }
        }));
        setPendingDownloadFile(null);
        resetUiAfterDownload();
      } catch (err) {
        console.error("Download failed", err);
        const isNotFoundError = (err == null ? void 0 : err.code) === "DOWNLOAD_NOT_FOUND" || (err == null ? void 0 : err.status) === 404;
        const downloadErrorMessage = (() => {
          if (isNotFoundError) {
            return "The PDF could not be found. Please regenerate the document to create a fresh link.";
          }
          if ((err == null ? void 0 : err.code) === "NON_PDF_CONTENT") {
            return "The download link returned text instead of a PDF. Please regenerate the document.";
          }
          if ((err == null ? void 0 : err.code) === "INVALID_PDF_SIGNATURE") {
            return "The downloaded file was corrupted. Please try regenerating the document.";
          }
          if ((err == null ? void 0 : err.code) === "EMPTY_PDF_CONTENT") {
            return "The downloaded file was empty. Please regenerate the document.";
          }
          return "Unable to download this document. Please try again.";
        })();
        setError(downloadErrorMessage, { stage: "download" });
        setDownloadStates((prev) => ({
          ...prev,
          [stateKey]: {
            status: isNotFoundError ? "error" : "idle",
            error: isNotFoundError ? "Download link unavailable. Please regenerate the document." : "Download failed. Try again or regenerate the document."
          }
        }));
        if (!isNotFoundError) {
          try {
            window.open(downloadUrl, "_blank", "noopener,noreferrer");
          } catch (openErr) {
            console.warn("Fallback open failed", openErr);
          }
        }
        setPendingDownloadFile(null);
      }
    },
    [
      downloadGeneratedAt,
      downloadTemplateMetadata,
      setError,
      setPendingDownloadFile,
      previewFile,
      openDownloadPreview,
      resetUiAfterDownload,
      refreshDownloadLink
    ]
  );
  const renderDownloadCard = reactExports.useCallback((file) => {
    if (!file)
      return null;
    const presentation = file.presentation || getDownloadPresentation(file);
    const templateMeta = file.templateMeta;
    const templateLabel = (templateMeta == null ? void 0 : templateMeta.name) || "";
    const rawVariantType = typeof presentation.variantType === "string" ? presentation.variantType.trim().toLowerCase() : "";
    const derivedVariantType = (() => {
      if (rawVariantType && DOWNLOAD_VARIANT_BADGE_STYLES[rawVariantType]) {
        return rawVariantType;
      }
      const badgeText = typeof presentation.badgeText === "string" ? presentation.badgeText.toLowerCase() : "";
      if (badgeText.includes("original"))
        return "original";
      if (badgeText.includes("enhanced"))
        return "enhanced";
      return "";
    })();
    const variantBadge = derivedVariantType ? DOWNLOAD_VARIANT_BADGE_STYLES[derivedVariantType] : null;
    const normalizedGeneratedAt = file.generatedAt || downloadGeneratedAt || "";
    const generatedAtLabel = formatDownloadTimestampLabel(normalizedGeneratedAt);
    const generatedAtIso = normalizeIsoTimestamp(normalizedGeneratedAt);
    const cardClass = `p-5 rounded-2xl shadow-sm flex flex-col gap-4 border ${presentation.cardBorder || "border-purple-200"} ${presentation.cardAccent || "bg-white/85"}`;
    const badgeClass = `px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide ${presentation.badgeStyle || "bg-purple-100 text-purple-700 border-purple-200"}`;
    const buttonClass = `inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-offset-2 ${presentation.buttonStyle || "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"}`;
    const secondaryButtonClass = "inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold border border-purple-200 text-purple-700 transition hover:text-purple-900 hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:ring-offset-2";
    const expiryDate = file.expiresAt ? new Date(file.expiresAt) : null;
    const isExpiryValid = expiryDate && !Number.isNaN(expiryDate.getTime());
    const expiryLabel = isExpiryValid ? expiryDate.toLocaleString(void 0, {
      dateStyle: "medium",
      timeStyle: "short"
    }) : null;
    const downloadUrl = typeof file.url === "string" ? file.url : "";
    const storageKey = typeof file.storageKey === "string" ? file.storageKey.trim() : "";
    const sessionLabel = extractSessionLabelFromStorageKey(storageKey);
    const canRefresh = Boolean(storageKey);
    const isExpired = Boolean(isExpiryValid && expiryDate.getTime() <= Date.now());
    const isCoverLetter = presentation.category === "cover" && isCoverLetterType(file.type);
    const coverDraftText = isCoverLetter ? coverLetterDrafts[file.type] ?? "" : "";
    const coverOriginalText = isCoverLetter ? coverLetterOriginals[file.type] ?? getCoverLetterTextFromFile(file) : "";
    const coverEdited = isCoverLetter && coverDraftText && coverDraftText !== coverOriginalText;
    const hasPreviewedCoverLetter = isCoverLetter ? Boolean(coverLetterReviewState[file.type]) : false;
    const downloadStateKey = getDownloadStateKey(file);
    const resolvedStateKey = downloadStateKey || (typeof file.url === "string" ? file.url : "");
    const downloadState = resolvedStateKey ? downloadStates[resolvedStateKey] : void 0;
    const isDownloading = (downloadState == null ? void 0 : downloadState.status) === "loading";
    const downloadHasError = (downloadState == null ? void 0 : downloadState.status) === "error";
    const downloadError = (downloadState == null ? void 0 : downloadState.error) || "";
    const derivedDownloadError = isExpired ? canRefresh ? "This link expired. Select Download to refresh it automatically." : "This link has expired. Regenerate the documents to refresh it." : !downloadUrl ? "Download link unavailable. Please regenerate the document." : downloadError;
    const isDownloadUnavailable = isDownloading || !downloadUrl || isExpired && !canRefresh || downloadHasError;
    const isCoverLetterDownloadDisabled = isCoverLetter ? !downloadUrl || isExpired && !canRefresh || downloadHasError : isDownloadUnavailable;
    const templateNameValue = typeof (templateMeta == null ? void 0 : templateMeta.name) === "string" && templateMeta.name.trim() || typeof file.templateName === "string" && file.templateName.trim() || typeof file.coverTemplateName === "string" && file.coverTemplateName.trim() || "";
    const templateIdValue = typeof (templateMeta == null ? void 0 : templateMeta.id) === "string" && templateMeta.id.trim() || typeof file.templateId === "string" && file.templateId.trim() || typeof file.coverTemplateId === "string" && file.coverTemplateId.trim() || typeof file.template === "string" && file.template.trim() || "";
    const directDownloadDisabled = !downloadUrl || isExpired && !canRefresh || downloadHasError;
    const directDownloadFileName = !directDownloadDisabled ? deriveDownloadFileName(file, presentation, null, {
      templateName: templateNameValue,
      templateId: templateIdValue,
      generatedAt: file.generatedAt,
      contentTypeOverride: "application/pdf",
      forcePdfExtension: true,
      versionId: file.versionId,
      versionHash: file.versionHash
    }) : "";
    const downloadLinkLabel = presentation.linkLabel || "Download File";
    const downloadLinkClass = `text-sm font-semibold transition ${directDownloadDisabled ? "text-rose-500 cursor-not-allowed" : "text-purple-700 hover:text-purple-900 underline decoration-purple-300 decoration-2 underline-offset-4"}`;
    const downloadLinkAriaLabel = [
      downloadLinkLabel,
      sessionLabel ? `Session ${sessionLabel}` : "",
      generatedAtLabel ? `Generated ${generatedAtLabel}` : "",
      expiryLabel ? `Expires ${expiryLabel}` : ""
    ].filter(Boolean).join(". ");
    const downloadButtonClass = `${buttonClass} ${isCoverLetter ? isCoverLetterDownloadDisabled ? "opacity-60 cursor-not-allowed" : "" : isDownloading ? "opacity-80 cursor-wait" : isDownloadUnavailable ? "opacity-60 cursor-not-allowed" : ""}`;
    const downloadButtonLabel = (() => {
      if (downloadHasError) {
        return "Link unavailable";
      }
      if (!downloadUrl) {
        return "Link unavailable";
      }
      if (isCoverLetter) {
        if (isExpired)
          return canRefresh ? "Refresh link" : "Link expired";
        if (isDownloading)
          return "Downloading…";
        return "Preview before download";
      }
      if (isExpired)
        return canRefresh ? "Refresh link" : "Link expired";
      if (isDownloading)
        return "Downloading…";
      return "Preview & Download";
    })();
    const metaItems = [];
    if (templateLabel) {
      metaItems.push({
        key: "template",
        content: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "Template: ",
          templateLabel
        ] })
      });
    }
    if (sessionLabel) {
      metaItems.push({
        key: "session",
        content: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "Session:",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-[11px] tracking-tight text-purple-600/90", children: sessionLabel })
        ] })
      });
    }
    if (generatedAtLabel) {
      metaItems.push({
        key: "generated",
        content: /* @__PURE__ */ jsxRuntimeExports.jsxs("time", { dateTime: generatedAtIso || void 0, children: [
          "Generated ",
          generatedAtLabel
        ] })
      });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cardClass, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold text-purple-900", children: presentation.label }),
            variantBadge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: variantBadge.className, children: variantBadge.text })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/90 leading-relaxed", children: presentation.description }),
          metaItems.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-purple-500 flex flex-wrap items-center gap-x-2 gap-y-1", children: metaItems.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
            index2 > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "•" }),
            item.content
          ] }, item.key)) })
        ] }),
        presentation.badgeText && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: badgeClass, children: presentation.badgeText })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => isCoverLetter ? openCoverLetterEditorModal(file) : openDownloadPreview(file),
              className: secondaryButtonClass,
              children: isCoverLetter ? "Preview & Edit" : "Preview"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                const canDownload = isCoverLetter ? Boolean(downloadUrl) && (!isExpired || canRefresh) && !downloadHasError : !isDownloadUnavailable;
                if (!canDownload) {
                  return;
                }
                if (isCoverLetter) {
                  openCoverLetterEditorModal(file);
                  return;
                }
                openDownloadPreview(file, { requireDownloadConfirmation: true });
              },
              className: downloadButtonClass,
              disabled: isCoverLetterDownloadDisabled,
              children: downloadButtonLabel
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-start gap-1 sm:items-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "a",
            {
              href: directDownloadDisabled ? void 0 : downloadUrl,
              onClick: async (event) => {
                if (directDownloadDisabled) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isExpired && canRefresh) {
                    try {
                      await refreshDownloadLink(file);
                    } catch (refreshErr) {
                      console.warn("Download link refresh failed", refreshErr);
                    }
                  }
                  return;
                }
                setTimeout(() => {
                  resetUiAfterDownload();
                }, 0);
              },
              className: downloadLinkClass,
              "aria-disabled": directDownloadDisabled ? "true" : void 0,
              "aria-label": downloadLinkAriaLabel || void 0,
              target: directDownloadDisabled ? void 0 : "_blank",
              rel: directDownloadDisabled ? void 0 : "noopener noreferrer",
              download: directDownloadDisabled ? void 0 : directDownloadFileName || void 0,
              title: [
                presentation.label,
                sessionLabel ? `Session: ${sessionLabel}` : "",
                generatedAtLabel ? `Generated ${generatedAtLabel}` : "",
                expiryLabel ? `Expires ${expiryLabel}` : "",
                storageKey ? `Storage key: ${storageKey}` : ""
              ].filter(Boolean).join(" • ") || void 0,
              children: downloadLinkLabel
            }
          ),
          (sessionLabel || generatedAtLabel) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-start gap-0 sm:items-end", children: [
            sessionLabel && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] font-mono uppercase tracking-tight text-purple-600/90", children: [
              "Session ",
              sessionLabel
            ] }),
            generatedAtLabel && /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "time",
              {
                dateTime: generatedAtIso || void 0,
                className: "text-[11px] font-medium text-purple-500",
                children: [
                  "Generated ",
                  generatedAtLabel
                ]
              }
            )
          ] }),
          expiryLabel && !isExpired && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-purple-600", children: [
            "Available until ",
            expiryLabel
          ] }),
          expiryLabel && isExpired && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-rose-600", children: canRefresh ? `Expired on ${expiryLabel}. Select Download to refresh the link automatically.` : `Expired on ${expiryLabel}. Generate the documents again to refresh the download link.` })
        ] })
      ] }),
      derivedDownloadError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-rose-600", children: derivedDownloadError }),
      isCoverLetter && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "p",
        {
          className: `text-xs ${coverEdited ? "text-indigo-600 font-semibold" : hasPreviewedCoverLetter ? "text-purple-500" : "text-amber-600 font-semibold"}`,
          children: coverEdited ? "Edits pending — download the refreshed PDF once you are happy with the text." : hasPreviewedCoverLetter ? "Download the tailored PDF from the editor or revisit it to tweak the copy." : "Open the editor to preview, personalise, and download your cover letter."
        }
      )
    ] }, file.type);
  }, [
    openDownloadPreview,
    openCoverLetterEditorModal,
    coverLetterDrafts,
    coverLetterOriginals,
    coverLetterReviewState,
    downloadStates,
    refreshDownloadLink,
    resetUiAfterDownload
  ]);
  const closePreview = reactExports.useCallback(() => {
    setPreviewActionBusy(false);
    setPreviewActiveAction("");
    setPreviewSuggestion(null);
  }, []);
  reactExports.useEffect(() => {
    if (!previewSuggestion || typeof window === "undefined") {
      return void 0;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewSuggestion, closePreview]);
  reactExports.useEffect(() => {
    if (!previewFile || typeof window === "undefined") {
      return void 0;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreviewFile(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewFile]);
  reactExports.useEffect(() => {
    var _a2;
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      autoPreviewSignatureRef.current = "";
      return;
    }
    const candidates = outputFiles.map((file) => {
      if (!file || typeof file !== "object") {
        return null;
      }
      const presentation = file.presentation || getDownloadPresentation(file);
      const priority = typeof presentation.autoPreviewPriority === "number" ? presentation.autoPreviewPriority : 50;
      const signature = `${file.type || ""}|${file.url || ""}|${file.updatedAt || ""}`;
      return { file, presentation, priority, signature };
    }).filter(Boolean).sort((a, b) => a.priority - b.priority);
    const nextCandidate = candidates.find((entry) => {
      var _a3;
      return ((_a3 = entry.presentation) == null ? void 0 : _a3.category) !== "cover";
    }) || candidates[0];
    if (!nextCandidate || !nextCandidate.signature) {
      return;
    }
    if (((_a2 = nextCandidate.presentation) == null ? void 0 : _a2.category) === "cover") {
      autoPreviewSignatureRef.current = nextCandidate.signature;
      return;
    }
    if (autoPreviewSignatureRef.current === nextCandidate.signature) {
      return;
    }
    autoPreviewSignatureRef.current = nextCandidate.signature;
    setPreviewFile({ ...nextCandidate.file, presentation: nextCandidate.presentation });
  }, [outputFiles, autoPreviewSignatureRef]);
  reactExports.useEffect(() => {
    if (!coverLetterEditor) {
      return;
    }
    const exists = outputFiles.some((file) => (file == null ? void 0 : file.type) === coverLetterEditor.type);
    if (!exists) {
      setCoverLetterEditor(null);
    }
  }, [coverLetterEditor, outputFiles]);
  reactExports.useEffect(() => {
    if (typeof window === "undefined") {
      return void 0;
    }
    const isDevEnvironment = typeof import.meta !== "undefined" && { "VITE_STAGE_NAME": "prod", "VITE_DEPLOYMENT_ENVIRONMENT": "prod", "VITE_API_BASE_URL": "https://j3a7m3jz11.execute-api.ap-south-1.amazonaws.com/prod", "VITE_PUBLISHED_CLOUDFRONT_METADATA": '{"stackName":"ResumeForge","url":"https://d109hwmzrqr39w.cloudfront.net","distributionId":"E2OWOS9JQQDVU3","apiGatewayUrl":"https://j3a7m3jz11.execute-api.ap-south-1.amazonaws.com/prod","originBucket":"resume-forge-app-2025","originRegion":"ap-south-1","originPath":"/static/client/prod/latest","updatedAt":"2025-03-18T09:30:00.000Z","degraded":false}', "BASE_URL": "./", "MODE": "production", "DEV": false, "PROD": true, "SSR": false } && false;
    if (isDevEnvironment) {
      window.__RESUMEFORGE_DEBUG_SET_IMPROVEMENTS__ = (payload) => {
        if (!Array.isArray(payload)) {
          setImprovementResults([]);
          return;
        }
        const hydrated = payload.map((entry, index2) => ({
          id: (entry == null ? void 0 : entry.id) || `debug-improvement-${index2}`,
          type: (entry == null ? void 0 : entry.type) || "custom",
          title: (entry == null ? void 0 : entry.title) || "Improvement",
          beforeExcerpt: (entry == null ? void 0 : entry.beforeExcerpt) || "",
          afterExcerpt: (entry == null ? void 0 : entry.afterExcerpt) || "",
          explanation: (entry == null ? void 0 : entry.explanation) || "",
          updatedResume: (entry == null ? void 0 : entry.updatedResume) || "",
          confidence: typeof (entry == null ? void 0 : entry.confidence) === "number" ? entry.confidence : 0.6,
          accepted: (entry == null ? void 0 : entry.accepted) ?? null,
          improvementSummary: Array.isArray(entry == null ? void 0 : entry.improvementSummary) ? entry.improvementSummary : [],
          rescoreSummary: normalizeRescoreSummary(entry == null ? void 0 : entry.rescoreSummary),
          scoreDelta: typeof (entry == null ? void 0 : entry.scoreDelta) === "number" && Number.isFinite(entry.scoreDelta) ? entry.scoreDelta : null,
          rescorePending: Boolean(entry == null ? void 0 : entry.rescorePending),
          rescoreError: typeof (entry == null ? void 0 : entry.rescoreError) === "string" ? entry.rescoreError : "",
          validation: normalizeImprovementValidation(entry == null ? void 0 : entry.validation)
        }));
        setImprovementResults(hydrated);
      };
    }
    return () => {
      if (isDevEnvironment && window.__RESUMEFORGE_DEBUG_SET_IMPROVEMENTS__) {
        delete window.__RESUMEFORGE_DEBUG_SET_IMPROVEMENTS__;
      }
    };
  }, []);
  reactExports.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return void 0;
    }
    const handleMessage = (event) => {
      var _a2;
      const data = event.data;
      if (!data || typeof data !== "object")
        return;
      if (data.type === "OFFLINE_UPLOAD_COMPLETE") {
        const payload = data.payload || {};
        setQueuedMessage(
          payload.message || data.message || "Upload processed after reconnection."
        );
        setIsProcessing(false);
        setError("", { stage: "upload" });
        const payloadUrls = Array.isArray(payload.urls) ? payload.urls : [];
        updateOutputFiles(payloadUrls, { generatedAt: payload.generatedAt });
        const { drafts, originals } = deriveCoverLetterStateFromFiles(payloadUrls);
        setCoverLetterDrafts(drafts);
        setCoverLetterOriginals(originals);
        setMatch(payload.match || null);
        const payloadJobId = typeof payload.jobId === "string" ? payload.jobId : "";
        if (payloadJobId) {
          setJobId(payloadJobId);
        }
        analysisContextRef.current = {
          hasAnalysis: true,
          cvSignature: cvSignatureRef.current,
          jobSignature: jobSignatureRef.current,
          jobId: payloadJobId || analysisContextRef.current.jobId || ""
        };
      } else if (data.type === "OFFLINE_UPLOAD_FAILED") {
        setQueuedMessage("");
        setIsProcessing(false);
        const payloadError = (_a2 = data == null ? void 0 : data.payload) == null ? void 0 : _a2.error;
        const failureMessage = typeof (data == null ? void 0 : data.message) === "string" && data.message.trim() || typeof (payloadError == null ? void 0 : payloadError.message) === "string" && payloadError.message.trim() || "Failed to process queued upload. Please try again.";
        setError(failureMessage, { stage: "upload" });
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    navigator.serviceWorker.ready.then((registration) => {
      var _a2;
      (_a2 = registration.active) == null ? void 0 : _a2.postMessage({ type: "RETRY_UPLOADS" });
    }).catch(() => {
    });
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);
  const handleDrop = reactExports.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError("Only PDF, DOC, or DOCX files are supported.", { stage: "upload" });
      return;
    }
    if (file) {
      lastAutoScoreSignatureRef.current = "";
      setError("", { stage: "upload" });
      if (cvInputRef.current) {
        cvInputRef.current.value = "";
      }
      setCvFile(file);
    }
  }, []);
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError("Only PDF, DOC, or DOCX files are supported.", { stage: "upload" });
      return;
    }
    if (file) {
      lastAutoScoreSignatureRef.current = "";
      setError("", { stage: "upload" });
      if (cvInputRef.current) {
        cvInputRef.current.value = "";
      }
      setCvFile(file);
    }
  };
  const handleUploadAreaClick = reactExports.useCallback(() => {
    if (cvInputRef.current && typeof cvInputRef.current.click === "function") {
      cvInputRef.current.click();
    }
  }, []);
  reactExports.useEffect(() => {
    const context = analysisContextRef.current || {};
    if (!context.hasAnalysis) {
      return;
    }
    const storedCvSignature = context.cvSignature || "";
    const storedJobSignature = context.jobSignature || "";
    const cvChanged = storedCvSignature && currentCvSignature && storedCvSignature !== currentCvSignature || !currentCvSignature && storedCvSignature || currentCvSignature && !storedCvSignature;
    const jobChanged = storedJobSignature && currentJobSignature && storedJobSignature !== currentJobSignature || !currentJobSignature && storedJobSignature || currentJobSignature && !storedJobSignature;
    if (cvChanged || jobChanged) {
      analysisContextRef.current = { hasAnalysis: false, cvSignature: "", jobSignature: "", jobId: "" };
      resetAnalysisState();
    }
  }, [currentCvSignature, currentJobSignature, resetAnalysisState]);
  const handleScoreSubmit = reactExports.useCallback(async () => {
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J;
    const hasQueuedRescore = Array.isArray(pendingImprovementRescoreRef.current) && pendingImprovementRescoreRef.current.length > 0;
    if (hasQueuedRescore) {
      setIsProcessing(true);
      setError("", { stage: "score" });
      try {
        if (runQueuedImprovementRescoreRef.current) {
          await runQueuedImprovementRescoreRef.current();
        }
      } finally {
        setIsProcessing(false);
      }
      return;
    }
    const manualText = manualJobDescriptionValue;
    const fileSignature = cvFile ? `${cvFile.name}|${cvFile.lastModified}` : "";
    const jobSignature = manualText ? `manual:${manualText}` : "";
    if (!cvFile) {
      setError("Please upload a CV before submitting.", { stage: "upload" });
      return;
    }
    if (!manualText) {
      setManualJobDescriptionRequired(true);
      setError("Please paste the full job description before continuing.", {
        stage: "upload"
      });
      (_b = (_a2 = manualJobDescriptionRef.current) == null ? void 0 : _a2.focus) == null ? void 0 : _b.call(_a2);
      return;
    }
    if (manualJobDescriptionHasProhibitedHtml) {
      setError("Remove HTML tags like <script> before continuing.", {
        stage: "upload"
      });
      (_d = (_c = manualJobDescriptionRef.current) == null ? void 0 : _c.focus) == null ? void 0 : _d.call(_c);
      return;
    }
    if (manualJobDescriptionLooksLikeUrl) {
      setManualJobDescriptionRequired(true);
      setError("Paste the full job description text instead of a link.", {
        stage: "upload"
      });
      (_f = (_e = manualJobDescriptionRef.current) == null ? void 0 : _e.focus) == null ? void 0 : _f.call(_e);
      return;
    }
    if (fileSignature) {
      lastAutoScoreSignatureRef.current = fileSignature;
    }
    setIsProcessing(true);
    setError("", { stage: "upload" });
    setMatch(null);
    setQueuedMessage("");
    resetAnalysisState();
    try {
      const formData = new FormData();
      formData.append("resume", cvFile);
      if (manualText) {
        formData.append("manualJobDescription", manualText);
      }
      if (manualCertificatesInput.trim()) {
        formData.append("manualCertificates", manualCertificatesInput.trim());
      }
      const {
        canonicalTemplate: canonicalUploadTemplate,
        canonicalPrimaryTemplate: primaryUploadTemplate,
        canonicalSecondaryTemplate: secondaryUploadTemplate,
        canonicalCoverTemplate: canonicalUploadCoverTemplate,
        canonicalCoverPrimaryTemplate: primaryCoverTemplate,
        canonicalCoverSecondaryTemplate: secondaryCoverTemplate,
        canonicalTemplateList,
        canonicalCoverTemplateList
      } = buildTemplateRequestContext(templateContext, selectedTemplate);
      formData.append("template", canonicalUploadTemplate);
      formData.append("templateId", canonicalUploadTemplate);
      formData.append("template1", primaryUploadTemplate);
      formData.append("template2", secondaryUploadTemplate);
      formData.append("coverTemplate", canonicalUploadCoverTemplate);
      formData.append("coverTemplate1", primaryCoverTemplate);
      formData.append("coverTemplate2", secondaryCoverTemplate);
      if (canonicalTemplateList.length) {
        formData.append("templates", JSON.stringify(canonicalTemplateList));
      }
      if (canonicalCoverTemplateList.length) {
        formData.append("coverTemplates", JSON.stringify(canonicalCoverTemplateList));
      }
      if (userIdentifier) {
        formData.append("userId", userIdentifier);
      }
      const requestUrl = buildApiUrl(API_BASE_URL, "/api/process-cv");
      const response = await fetch(requestUrl, {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        let data2 = {};
        try {
          data2 = await response.json();
        } catch {
          data2 = {};
        }
        const fallbackMessage = response.status >= 500 ? CV_GENERATION_ERROR_MESSAGE : "Request failed";
        const {
          message: resolvedMessage,
          code: errorCode,
          isFriendly,
          source: errorSource,
          logs: errorLogsValue,
          requestId: errorRequestId
        } = resolveApiError({
          data: data2,
          fallback: fallbackMessage,
          status: response.status
        });
        const detailField = typeof ((_h = (_g = data2 == null ? void 0 : data2.error) == null ? void 0 : _g.details) == null ? void 0 : _h.field) === "string" ? data2.error.details.field : "";
        const manualRequired = ((_j = (_i = data2 == null ? void 0 : data2.error) == null ? void 0 : _i.details) == null ? void 0 : _j.manualInputRequired) === true || errorCode === "JOB_DESCRIPTION_REQUIRED" || detailField === "manualJobDescription";
        const prohibitedHtmlError = errorCode === "JOB_DESCRIPTION_PROHIBITED_TAGS";
        let message = resolvedMessage;
        if (manualRequired) {
          setManualJobDescriptionRequired(true);
          (_l = (_k = manualJobDescriptionRef.current) == null ? void 0 : _k.focus) == null ? void 0 : _l.call(_k);
          message = "Paste the full job description to continue.";
        }
        if (prohibitedHtmlError) {
          (_n = (_m = manualJobDescriptionRef.current) == null ? void 0 : _m.focus) == null ? void 0 : _n.call(_m);
          message = "Remove HTML tags like <script> before continuing.";
        }
        if (!isFriendly && errorCode && errorCode !== "PROCESSING_FAILED") {
          message = `${message} (${errorCode})`;
        }
        console.error("Resume processing request failed", {
          status: response.status,
          statusText: response.statusText,
          message
        });
        const error2 = new Error(message);
        if (errorCode) {
          error2.code = errorCode;
        }
        if (errorSource) {
          error2.serviceError = errorSource;
        }
        if (errorRequestId) {
          error2.requestId = errorRequestId;
        }
        if (Array.isArray(errorLogsValue) && errorLogsValue.length) {
          error2.logs = errorLogsValue;
        }
        throw error2;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        const fallbackMessage = response.status >= 500 ? CV_GENERATION_ERROR_MESSAGE : "Invalid JSON response";
        throw new Error(text || fallbackMessage);
      }
      const data = await response.json();
      if (response.status === 202 && (data == null ? void 0 : data.queued)) {
        setQueuedMessage(
          data.message || "You are offline. The upload will resume automatically once you reconnect."
        );
        if (data.jobId) {
          setPollingJobId(data.jobId);
        }
        return;
      }
      const outputFilesValue = normalizeOutputFiles(data.urls, {
        defaultExpiresAt: data == null ? void 0 : data.urlExpiresAt,
        defaultExpiresInSeconds: data == null ? void 0 : data.urlExpiresInSeconds,
        allowEmptyUrls: true
      });
      updateOutputFiles(outputFilesValue, { generatedAt: data == null ? void 0 : data.generatedAt });
      setArtifactsUploaded(Boolean((data == null ? void 0 : data.artifactsUploaded) || outputFilesValue.length > 0));
      const { drafts: analysisCoverLetterDrafts, originals: analysisCoverLetterOriginals } = deriveCoverLetterStateFromFiles(outputFilesValue);
      setCoverLetterDrafts(analysisCoverLetterDrafts);
      setCoverLetterOriginals(analysisCoverLetterOriginals);
      const jobIdValue = typeof data.jobId === "string" ? data.jobId : "";
      setJobId(jobIdValue);
      const templateContextValue = normalizeTemplateContext(
        data && typeof data.templateContext === "object" ? data.templateContext : null
      );
      setTemplateContext(templateContextValue);
      const probabilityBeforeValue = typeof data.selectionProbabilityBefore === "number" ? data.selectionProbabilityBefore : typeof ((_p = (_o = data.selectionInsights) == null ? void 0 : _o.before) == null ? void 0 : _p.probability) === "number" ? data.selectionInsights.before.probability : null;
      const probabilityBeforeMeaning = ((_r = (_q = data.selectionInsights) == null ? void 0 : _q.before) == null ? void 0 : _r.level) || (typeof probabilityBeforeValue === "number" ? probabilityBeforeValue >= 75 ? "High" : probabilityBeforeValue >= 55 ? "Medium" : "Low" : null);
      const probabilityBeforeRationale = ((_t = (_s = data.selectionInsights) == null ? void 0 : _s.before) == null ? void 0 : _t.message) || ((_v = (_u = data.selectionInsights) == null ? void 0 : _u.before) == null ? void 0 : _v.rationale) || (typeof probabilityBeforeValue === "number" && probabilityBeforeMeaning ? `Projected ${probabilityBeforeMeaning.toLowerCase()} probability (${probabilityBeforeValue}%) that this resume will be shortlisted for the JD.` : null);
      const probabilityValue = typeof data.selectionProbabilityAfter === "number" ? data.selectionProbabilityAfter : typeof data.selectionProbability === "number" ? data.selectionProbability : typeof ((_x = (_w = data.selectionInsights) == null ? void 0 : _w.after) == null ? void 0 : _x.probability) === "number" ? data.selectionInsights.after.probability : typeof ((_y = data.selectionInsights) == null ? void 0 : _y.probability) === "number" ? data.selectionInsights.probability : null;
      const probabilityMeaning = ((_A = (_z = data.selectionInsights) == null ? void 0 : _z.after) == null ? void 0 : _A.level) || ((_B = data.selectionInsights) == null ? void 0 : _B.level) || (typeof probabilityValue === "number" ? probabilityValue >= 75 ? "High" : probabilityValue >= 55 ? "Medium" : "Low" : null);
      const probabilityRationale = ((_D = (_C = data.selectionInsights) == null ? void 0 : _C.after) == null ? void 0 : _D.message) || ((_F = (_E = data.selectionInsights) == null ? void 0 : _E.after) == null ? void 0 : _F.rationale) || ((_G = data.selectionInsights) == null ? void 0 : _G.message) || ((_H = data.selectionInsights) == null ? void 0 : _H.rationale) || (typeof probabilityValue === "number" && probabilityMeaning ? `Projected ${probabilityMeaning.toLowerCase()} probability (${probabilityValue}%) that this resume will be shortlisted for the JD.` : null);
      const normalizePercent2 = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
      const keywordScoreBefore = normalizePercent2(data.originalScore);
      const keywordScoreAfter = normalizePercent2(
        typeof data.enhancedScore === "number" ? data.enhancedScore : data.originalScore
      );
      const atsScoreBeforeResponse = normalizePercent2(data.atsScoreBefore);
      const atsScoreAfterResponse = normalizePercent2(data.atsScoreAfter);
      const atsScoreBeforeExplanation = typeof data.atsScoreBeforeExplanation === "string" ? data.atsScoreBeforeExplanation : typeof data.originalScoreExplanation === "string" ? data.originalScoreExplanation : "";
      const atsScoreAfterExplanation = typeof data.atsScoreAfterExplanation === "string" ? data.atsScoreAfterExplanation : typeof data.enhancedScoreExplanation === "string" ? data.enhancedScoreExplanation : "";
      const matchPayload = {
        table: Array.isArray(data.table) ? data.table : [],
        addedSkills: Array.isArray(data.addedSkills) ? data.addedSkills : [],
        missingSkills: Array.isArray(data.missingSkills) ? data.missingSkills : [],
        atsScoreBefore: atsScoreBeforeResponse,
        atsScoreAfter: atsScoreAfterResponse,
        originalScore: keywordScoreBefore,
        enhancedScore: keywordScoreAfter,
        originalTitle: data.originalTitle || "",
        modifiedTitle: data.modifiedTitle || "",
        selectionProbability: probabilityValue,
        selectionProbabilityMeaning: probabilityMeaning,
        selectionProbabilityRationale: probabilityRationale,
        selectionProbabilityBefore: probabilityBeforeValue,
        selectionProbabilityBeforeMeaning: probabilityBeforeMeaning,
        selectionProbabilityBeforeRationale: probabilityBeforeRationale,
        selectionProbabilityAfter: probabilityValue,
        selectionProbabilityAfterMeaning: probabilityMeaning,
        selectionProbabilityAfterRationale: probabilityRationale,
        selectionProbabilityFactors: Array.isArray(data.selectionProbabilityFactors) ? cloneData(data.selectionProbabilityFactors) : Array.isArray((_I = data.selectionInsights) == null ? void 0 : _I.factors) ? cloneData(data.selectionInsights.factors) : [],
        atsScoreBeforeExplanation,
        atsScoreAfterExplanation,
        originalScoreExplanation: typeof data.originalScoreExplanation === "string" ? data.originalScoreExplanation : atsScoreBeforeExplanation,
        enhancedScoreExplanation: typeof data.enhancedScoreExplanation === "string" ? data.enhancedScoreExplanation : atsScoreAfterExplanation
      };
      setMatch(matchPayload);
      const toMetricArray = (input) => {
        if (Array.isArray(input))
          return input;
        if (input && typeof input === "object")
          return Object.values(input);
        return [];
      };
      const baselineCandidates = toMetricArray(
        data.atsSubScoresBefore || data.baselineScoreBreakdown
      );
      const breakdownCandidates = toMetricArray(
        data.atsSubScores || data.atsSubScoresAfter || data.scoreBreakdown
      );
      const normalizedBaseline = orderAtsMetrics(
        baselineCandidates.length ? baselineCandidates : breakdownCandidates
      ).map((metric) => {
        var _a3;
        return {
          ...metric,
          tip: (metric == null ? void 0 : metric.tip) ?? ((_a3 = metric == null ? void 0 : metric.tips) == null ? void 0 : _a3[0]) ?? ""
        };
      });
      const breakdownSource = breakdownCandidates.length ? breakdownCandidates : baselineCandidates.length ? baselineCandidates : [];
      const normalizedBreakdown = orderAtsMetrics(breakdownSource).map((metric) => {
        var _a3;
        return {
          ...metric,
          tip: (metric == null ? void 0 : metric.tip) ?? ((_a3 = metric == null ? void 0 : metric.tips) == null ? void 0 : _a3[0]) ?? ""
        };
      });
      setBaselineScoreBreakdown(normalizedBaseline);
      setScoreBreakdown(normalizedBreakdown);
      const resumeTextValue = typeof data.resumeText === "string" ? data.resumeText : "";
      const originalResumeSnapshot = typeof data.originalResumeText === "string" ? data.originalResumeText : resumeTextValue;
      setResumeText(originalResumeSnapshot);
      const jobDescriptionValue = typeof data.jobDescriptionText === "string" ? data.jobDescriptionText : "";
      setJobDescriptionText(jobDescriptionValue);
      const jobSkillsValue = Array.isArray(data.jobSkills) ? data.jobSkills : [];
      setJobSkills(jobSkillsValue);
      const resumeSkillsValue = Array.isArray(data.resumeSkills) ? data.resumeSkills : [];
      setResumeSkills(resumeSkillsValue);
      const knownCertificatesValue = (((_J = data.certificateInsights) == null ? void 0 : _J.known) || []).map((cert) => ({
        ...cert,
        source: cert.source || "resume"
      }));
      setKnownCertificates(knownCertificatesValue);
      const manualCertificatesValue = data.manualCertificates || [];
      setManualCertificatesData(manualCertificatesValue);
      const certificateInsightsValue = data.certificateInsights || null;
      setCertificateInsights(certificateInsightsValue);
      const selectionInsightsValue = data.selectionInsights || null;
      setSelectionInsights(selectionInsightsValue);
      const changeLogValue = Array.isArray(data.changeLog) ? data.changeLog : [];
      setChangeLog(changeLogValue);
      setManualJobDescriptionRequired(false);
      setInitialAnalysisSnapshot({
        resumeText: originalResumeSnapshot,
        originalResumeText: originalResumeSnapshot,
        enhancedResumeText: resumeTextValue,
        jobDescriptionText: jobDescriptionValue,
        jobSkills: cloneData(jobSkillsValue),
        resumeSkills: cloneData(resumeSkillsValue),
        knownCertificates: cloneData(knownCertificatesValue),
        manualCertificatesData: cloneData(manualCertificatesValue),
        certificateInsights: cloneData(certificateInsightsValue),
        selectionInsights: cloneData(selectionInsightsValue),
        match: cloneData(matchPayload),
        scoreBreakdown: cloneData(normalizedBreakdown),
        baselineScoreBreakdown: cloneData(normalizedBaseline),
        outputFiles: cloneData(outputFilesValue),
        templateContext: cloneData(templateContextValue),
        changeLog: cloneData(changeLogValue),
        coverLetterDrafts: cloneData(analysisCoverLetterDrafts),
        coverLetterOriginals: cloneData(analysisCoverLetterOriginals)
      });
      setResumeHistory([]);
      analysisContextRef.current = {
        hasAnalysis: true,
        cvSignature: fileSignature,
        jobSignature,
        jobId: jobIdValue
      };
    } catch (err) {
      console.error("Unable to enhance CV", err);
      const errorMessage = typeof (err == null ? void 0 : err.message) === "string" && err.message.trim() || CV_GENERATION_ERROR_MESSAGE;
      const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err);
      const { logs: errorLogsValue, requestId: errorRequestId } = extractErrorMetadata(err);
      setError(errorMessage, {
        serviceError: serviceErrorSource,
        errorCode,
        logs: errorLogsValue,
        requestId: errorRequestId,
        stage: "upload"
      });
      lastAutoScoreSignatureRef.current = "";
    } finally {
      setIsProcessing(false);
    }
  }, [
    API_BASE_URL,
    cvFile,
    manualCertificatesInput,
    manualJobDescriptionHasProhibitedHtml,
    manualJobDescriptionLooksLikeUrl,
    manualJobDescriptionValue,
    resetAnalysisState,
    updateOutputFiles,
    selectedTemplate,
    templateContext,
    userIdentifier
  ]);
  reactExports.useEffect(() => {
    if (!cvFile || isProcessing) {
      return;
    }
    if (!manualJobDescriptionValue || manualJobDescriptionLooksLikeUrl || manualJobDescriptionHasProhibitedHtml) {
      return;
    }
    const signature = cvFile ? `${cvFile.name}|${cvFile.lastModified}` : "";
    if (!signature) {
      return;
    }
    if (lastAutoScoreSignatureRef.current === signature) {
      return;
    }
    handleScoreSubmit();
  }, [
    cvFile,
    handleScoreSubmit,
    isProcessing,
    manualJobDescriptionHasProhibitedHtml,
    manualJobDescriptionLooksLikeUrl,
    manualJobDescriptionValue,
    scoreComplete
  ]);
  const hasAcceptedImprovements = reactExports.useMemo(
    () => improvementResults.some((item) => item.accepted === true),
    [improvementResults]
  );
  const baselineResumeText = typeof (initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.originalResumeText) === "string" ? initialAnalysisSnapshot.originalResumeText : (initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.resumeText) ?? "";
  const resetAvailable = Boolean(initialAnalysisSnapshot) && (baselineResumeText !== resumeText || changeLog.length > 0 || hasAcceptedImprovements);
  const handleResetToOriginal = reactExports.useCallback(() => {
    if (!initialAnalysisSnapshot)
      return;
    const snapshot = initialAnalysisSnapshot;
    const resumeValue = typeof snapshot.originalResumeText === "string" ? snapshot.originalResumeText : typeof snapshot.resumeText === "string" ? snapshot.resumeText : "";
    setResumeText(resumeValue);
    const jobDescriptionValue = typeof snapshot.jobDescriptionText === "string" ? snapshot.jobDescriptionText : "";
    setJobDescriptionText(jobDescriptionValue);
    const jobSkillsValue = Array.isArray(snapshot.jobSkills) ? cloneData(snapshot.jobSkills) : [];
    setJobSkills(jobSkillsValue);
    const resumeSkillsValue = Array.isArray(snapshot.resumeSkills) ? cloneData(snapshot.resumeSkills) : [];
    setResumeSkills(resumeSkillsValue);
    const knownCertificatesValue = Array.isArray(snapshot.knownCertificates) ? cloneData(snapshot.knownCertificates) : [];
    setKnownCertificates(knownCertificatesValue);
    const manualCertificatesValue = cloneData(snapshot.manualCertificatesData);
    setManualCertificatesData(manualCertificatesValue || []);
    setCertificateInsights(cloneData(snapshot.certificateInsights));
    setSelectionInsights(cloneData(snapshot.selectionInsights));
    setMatch(snapshot.match ? cloneData(snapshot.match) : null);
    const scoreBreakdownValue = Array.isArray(snapshot.scoreBreakdown) ? cloneData(snapshot.scoreBreakdown) : [];
    setScoreBreakdown(scoreBreakdownValue);
    const baselineBreakdownValue = Array.isArray(snapshot.baselineScoreBreakdown) ? cloneData(snapshot.baselineScoreBreakdown) : scoreBreakdownValue;
    setBaselineScoreBreakdown(baselineBreakdownValue);
    const outputFilesValue = normalizeOutputFiles(snapshot.outputFiles, {
      defaultExpiresAt: snapshot == null ? void 0 : snapshot.urlExpiresAt,
      defaultExpiresInSeconds: snapshot == null ? void 0 : snapshot.urlExpiresInSeconds,
      allowEmptyUrls: true
    });
    updateOutputFiles(outputFilesValue, { generatedAt: snapshot == null ? void 0 : snapshot.generatedAt });
    setArtifactsUploaded(Boolean((snapshot == null ? void 0 : snapshot.artifactsUploaded) || outputFilesValue.length > 0));
    const snapshotCoverDrafts = snapshot.coverLetterDrafts && typeof snapshot.coverLetterDrafts === "object" ? cloneData(snapshot.coverLetterDrafts) : deriveCoverLetterStateFromFiles(outputFilesValue).drafts;
    const snapshotCoverOriginals = snapshot.coverLetterOriginals && typeof snapshot.coverLetterOriginals === "object" ? cloneData(snapshot.coverLetterOriginals) : deriveCoverLetterStateFromFiles(outputFilesValue).originals;
    setCoverLetterDrafts(snapshotCoverDrafts || {});
    setCoverLetterOriginals(snapshotCoverOriginals || {});
    setCoverLetterEditor(null);
    setCoverLetterDownloadError("");
    setCoverLetterClipboardStatus("");
    const templateContextValue = normalizeTemplateContext(
      snapshot.templateContext && typeof snapshot.templateContext === "object" ? cloneData(snapshot.templateContext) : null
    );
    setTemplateContext(templateContextValue);
    const snapshotChangeLog = Array.isArray(snapshot.changeLog) ? cloneData(snapshot.changeLog) : [];
    setChangeLog(snapshotChangeLog || []);
    setImprovementResults(
      (prev) => prev.map((item) => ({
        ...item,
        accepted: null,
        rescorePending: false,
        rescoreError: "",
        scoreDelta: null
      }))
    );
    setResumeHistory([]);
    setError("", { stage: "enhance" });
    setPreviewSuggestion(null);
  }, [initialAnalysisSnapshot, updateOutputFiles]);
  const deltaSummary = reactExports.useMemo(
    () => deriveDeltaSummary({
      match,
      changeLog,
      certificateInsights,
      manualCertificates: manualCertificatesData,
      jobSkills,
      resumeSkills
    }),
    [match, changeLog, certificateInsights, manualCertificatesData, jobSkills, resumeSkills]
  );
  const recommendedCertificateNames = reactExports.useMemo(() => {
    const suggestions = Array.isArray(certificateInsights == null ? void 0 : certificateInsights.suggestions) ? certificateInsights.suggestions : [];
    const formatted = suggestions.map((item) => formatCertificateDisplay(item)).filter(Boolean);
    return toUniqueList(formatted);
  }, [certificateInsights]);
  const missingCertificateNames = reactExports.useMemo(() => {
    var _a2;
    const missing = Array.isArray((_a2 = deltaSummary == null ? void 0 : deltaSummary.certificates) == null ? void 0 : _a2.missing) ? deltaSummary.certificates.missing : [];
    const normalizedMissing = missing.map((item) => formatCertificateDisplay(item)).filter((item) => item && item.toLowerCase() !== "manual entry required");
    if (normalizedMissing.length > 0) {
      return toUniqueList(normalizedMissing);
    }
    return recommendedCertificateNames;
  }, [deltaSummary, recommendedCertificateNames]);
  const knownCertificateNames = reactExports.useMemo(() => {
    const known = Array.isArray(certificateInsights == null ? void 0 : certificateInsights.known) ? certificateInsights.known : [];
    const manual = Array.isArray(manualCertificatesData) ? manualCertificatesData : [];
    const formatted = [...known, ...manual].map((item) => formatCertificateDisplay(item)).filter(Boolean);
    return toUniqueList(formatted);
  }, [certificateInsights, manualCertificatesData]);
  const additionalRecommendedCertificates = reactExports.useMemo(() => {
    if (!recommendedCertificateNames.length) {
      return [];
    }
    const missingSet = new Set(
      missingCertificateNames.map((item) => item.toLowerCase())
    );
    return recommendedCertificateNames.filter(
      (item) => !missingSet.has(item.toLowerCase())
    );
  }, [recommendedCertificateNames, missingCertificateNames]);
  const analysisHighlights = reactExports.useMemo(() => {
    var _a2;
    const items = [];
    const seenKeys = /* @__PURE__ */ new Set();
    const pushHighlight = (item) => {
      if (!item || !item.key || seenKeys.has(item.key)) {
        return;
      }
      items.push(item);
      seenKeys.add(item.key);
    };
    const getMissingFromSummary = (key) => {
      const bucket = deltaSummary == null ? void 0 : deltaSummary[key];
      if (!bucket)
        return [];
      return toUniqueList(bucket.missing || []);
    };
    const missingSkills = getMissingFromSummary("skills");
    if (missingSkills.length > 0) {
      pushHighlight({
        key: "missing-skills",
        tone: "warning",
        title: "Missing JD skills",
        message: `Add ${summariseItems(missingSkills, {
          limit: 6,
          decorate: buildActionDecorator((skill) => `Practice ${skill}`)
        })} to mirror the JD keywords.`
      });
    }
    const designationMissing = getMissingFromSummary("designation");
    if (designationMissing.length > 0) {
      const designationAdded = toUniqueList(((_a2 = deltaSummary == null ? void 0 : deltaSummary.designation) == null ? void 0 : _a2.added) || []);
      const fromText = formatReadableList(designationMissing);
      const toText = summariseItems(designationAdded, { limit: 3 }) || (match == null ? void 0 : match.modifiedTitle) || "";
      const message = toText ? `Update your headline from ${fromText} to ${toText} so it mirrors the JD title.` : `Update your headline to replace ${fromText} with the JD designation.`;
      pushHighlight({
        key: "designation-mismatch",
        tone: "info",
        title: "Designation mismatch",
        message
      });
    }
    const experienceMissing = getMissingFromSummary("experience");
    if (experienceMissing.length > 0) {
      pushHighlight({
        key: "missing-experience",
        tone: "warning",
        title: "Experience gaps",
        message: `Cover stories about ${summariseItems(experienceMissing, {
          limit: 4,
          decorate: buildActionDecorator((item) => `Rehearse story about ${item}`)
        })} to prove the required experience.`
      });
    }
    const tasksMissing = getMissingFromSummary("tasks");
    if (tasksMissing.length > 0) {
      pushHighlight({
        key: "missing-tasks",
        tone: "warning",
        title: "Task coverage gaps",
        message: `Add responsibilities such as ${summariseItems(tasksMissing, {
          limit: 4,
          decorate: buildActionDecorator((item) => `Prepare example covering ${item}`)
        })} to mirror JD expectations.`
      });
    }
    const highlightsMissing = getMissingFromSummary("highlights");
    if (highlightsMissing.length > 0) {
      pushHighlight({
        key: "missing-highlights",
        tone: "info",
        title: "Missing highlights",
        message: `Refresh your summary to phase out ${summariseItems(highlightsMissing, {
          limit: 4,
          decorate: buildActionDecorator((item) => `Trim ${item}`)
        })} and spotlight JD-aligned wins.`
      });
    }
    if (missingCertificateNames.length > 0) {
      pushHighlight({
        key: "missing-certificates",
        tone: "warning",
        title: "Certification gaps",
        message: `List certifications such as ${summariseItems(missingCertificateNames, {
          limit: 4,
          decorate: buildActionDecorator((cert) => `Add credential ${cert}`)
        })} to satisfy JD requirements.`
      });
    }
    const addedSkills = Array.isArray(match == null ? void 0 : match.addedSkills) ? match.addedSkills : [];
    if (addedSkills.length > 0) {
      pushHighlight({
        key: "added-skills",
        tone: "success",
        title: "Highlights added",
        message: `Enhanced drafts now surface ${summariseItems(addedSkills, {
          limit: 5,
          decorate: buildActionDecorator((skill) => `Practice ${skill}`)
        })}. Review them before the interview.`
      });
    }
    if (certificateInsights == null ? void 0 : certificateInsights.manualEntryRequired) {
      pushHighlight({
        key: "cert-manual",
        tone: "warning",
        title: "Missing certifications",
        message: "Credly requires authentication. Paste critical certifications manually so we can include them."
      });
    }
    if (recommendedCertificateNames.length > 0) {
      pushHighlight({
        key: "cert-suggestions",
        tone: "info",
        title: "Recommended certifications",
        message: `Consider adding ${summariseItems(recommendedCertificateNames, {
          limit: 4,
          decorate: buildActionDecorator((cert) => `Add credential ${cert}`)
        })} to strengthen the match.`
      });
    }
    return items;
  }, [
    deltaSummary,
    match,
    certificateInsights,
    missingCertificateNames,
    recommendedCertificateNames
  ]);
  const jobFitScores = reactExports.useMemo(() => {
    if (!Array.isArray(selectionInsights == null ? void 0 : selectionInsights.jobFitScores)) {
      return [];
    }
    return selectionInsights.jobFitScores.map((metric) => {
      const rawScore = typeof (metric == null ? void 0 : metric.score) === "number" ? metric.score : 0;
      const safeScore = Number.isFinite(rawScore) ? Math.min(Math.max(Math.round(rawScore), 0), 100) : 0;
      return {
        ...metric,
        score: safeScore
      };
    });
  }, [selectionInsights]);
  const jobFitAverage = typeof (selectionInsights == null ? void 0 : selectionInsights.jobFitAverage) === "number" && Number.isFinite(selectionInsights.jobFitAverage) ? Math.min(Math.max(Math.round(selectionInsights.jobFitAverage), 0), 100) : null;
  const learningResources = reactExports.useMemo(() => {
    if (!Array.isArray(selectionInsights == null ? void 0 : selectionInsights.learningResources)) {
      return [];
    }
    return selectionInsights.learningResources.map((entry) => {
      const skill = typeof (entry == null ? void 0 : entry.skill) === "string" ? entry.skill.trim() : "";
      if (!skill) {
        return null;
      }
      const resources = Array.isArray(entry == null ? void 0 : entry.resources) ? entry.resources.map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const url = typeof item.url === "string" ? item.url.trim() : "";
        if (!url) {
          return null;
        }
        const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : url;
        const description = typeof item.description === "string" ? item.description.trim() : "";
        return { title, url, description };
      }).filter(Boolean) : [];
      if (resources.length === 0) {
        return null;
      }
      return { skill, resources };
    }).filter(Boolean);
  }, [selectionInsights]);
  const hasLearningResources = learningResources.length > 0;
  const resumeComparisonData = reactExports.useMemo(() => {
    const baselineRaw = typeof baselineResumeText === "string" ? baselineResumeText : "";
    const improvedRaw = typeof resumeText === "string" ? resumeText : "";
    const baselineTrimmed = baselineRaw.trim();
    const improvedTrimmed = improvedRaw.trim();
    if (!baselineTrimmed || !improvedTrimmed || baselineTrimmed === improvedTrimmed) {
      return null;
    }
    const normaliseText = (value) => {
      if (typeof value === "string") {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      return "";
    };
    const toList = (value) => {
      if (Array.isArray(value)) {
        return value.map(normaliseText).filter(Boolean);
      }
      const text = normaliseText(value);
      return text ? [text] : [];
    };
    const addItemsToSet = (targetSet, values) => {
      toList(values).forEach((item) => targetSet.add(item));
    };
    let segmentCounter = 0;
    const segmentMap = /* @__PURE__ */ new Map();
    const ensureSegmentBucket = ({ section, fallbackLabel = "", keyHint = "" }) => {
      const sectionLabel = normaliseText(section) || normaliseText(fallbackLabel) || "Updated Section";
      let mapKey = normaliseText(keyHint) || sectionLabel.toLowerCase();
      if (!mapKey) {
        mapKey = `segment-${segmentCounter++}`;
      }
      if (!segmentMap.has(mapKey)) {
        segmentMap.set(mapKey, {
          section: sectionLabel,
          added: /* @__PURE__ */ new Set(),
          removed: /* @__PURE__ */ new Set(),
          reason: /* @__PURE__ */ new Set()
        });
      }
      const bucket = segmentMap.get(mapKey);
      if (!bucket.section && sectionLabel) {
        bucket.section = sectionLabel;
      }
      return bucket;
    };
    const pushReasons2 = (bucket, reasons, fallbackDetail = "") => {
      const lines = toList(reasons);
      if (lines.length === 0 && fallbackDetail) {
        lines.push(...toList(fallbackDetail));
      }
      lines.forEach((line) => bucket.reason.add(line));
    };
    const aggregatedAdded = /* @__PURE__ */ new Set();
    const aggregatedRemoved = /* @__PURE__ */ new Set();
    const changeLogEntries = Array.isArray(changeLog) ? changeLog : [];
    changeLogEntries.forEach((entry) => {
      const entryAdded = toList(entry == null ? void 0 : entry.addedItems);
      const entryRemoved = toList(entry == null ? void 0 : entry.removedItems);
      addItemsToSet(aggregatedAdded, entryAdded);
      addItemsToSet(aggregatedRemoved, entryRemoved);
      const segments = Array.isArray(entry == null ? void 0 : entry.summarySegments) ? entry.summarySegments : [];
      if (segments.length > 0) {
        segments.forEach((segment) => {
          addItemsToSet(aggregatedAdded, segment == null ? void 0 : segment.added);
          addItemsToSet(aggregatedRemoved, segment == null ? void 0 : segment.removed);
          const bucket = ensureSegmentBucket({
            section: segment == null ? void 0 : segment.section,
            fallbackLabel: entry == null ? void 0 : entry.title,
            keyHint: (segment == null ? void 0 : segment.section) || (entry == null ? void 0 : entry.id) || (entry == null ? void 0 : entry.title)
          });
          addItemsToSet(bucket.added, segment == null ? void 0 : segment.added);
          addItemsToSet(bucket.removed, segment == null ? void 0 : segment.removed);
          pushReasons2(bucket, segment == null ? void 0 : segment.reason, entry == null ? void 0 : entry.detail);
        });
      } else if (entryAdded.length > 0 || entryRemoved.length > 0) {
        const bucket = ensureSegmentBucket({
          section: entry == null ? void 0 : entry.title,
          fallbackLabel: entry == null ? void 0 : entry.label,
          keyHint: (entry == null ? void 0 : entry.id) || (entry == null ? void 0 : entry.title) || (entry == null ? void 0 : entry.label)
        });
        addItemsToSet(bucket.added, entryAdded);
        addItemsToSet(bucket.removed, entryRemoved);
        pushReasons2(bucket, [], entry == null ? void 0 : entry.detail);
      }
    });
    const summarySegments = Array.from(segmentMap.values()).map((segment) => ({
      section: segment.section,
      added: Array.from(segment.added),
      removed: Array.from(segment.removed),
      reason: Array.from(segment.reason)
    })).filter(
      (segment) => segment.section || segment.added.length > 0 || segment.removed.length > 0 || segment.reason.length > 0
    );
    return {
      before: baselineRaw,
      after: improvedRaw,
      summarySegments,
      addedItems: Array.from(aggregatedAdded),
      removedItems: Array.from(aggregatedRemoved)
    };
  }, [baselineResumeText, resumeText, changeLog]);
  const { summarySegments: comparisonSummarySegments, signature: comparisonSummarySignature } = reactExports.useMemo(() => {
    const segments = (resumeComparisonData == null ? void 0 : resumeComparisonData.summarySegments) || [];
    return {
      summarySegments: segments,
      signature: buildSummarySegmentSignature(segments)
    };
  }, [resumeComparisonData]);
  reactExports.useEffect(() => {
    setMatch((prev) => {
      if (!prev) {
        return prev;
      }
      const currentSignature = buildSummarySegmentSignature(prev.improvementSummary);
      if (currentSignature === comparisonSummarySignature) {
        return prev;
      }
      if (!comparisonSummarySignature && (!comparisonSummarySegments || comparisonSummarySegments.length === 0)) {
        if (!currentSignature) {
          return prev;
        }
        return { ...prev, improvementSummary: [] };
      }
      return {
        ...prev,
        improvementSummary: cloneData(comparisonSummarySegments)
      };
    });
  }, [comparisonSummarySignature, comparisonSummarySegments]);
  const showDeltaSummary = Boolean(
    match || certificateInsights && (certificateInsights.known && certificateInsights.known.length > 0 || certificateInsights.suggestions && certificateInsights.suggestions.length > 0 || certificateInsights.manualEntryRequired) || manualCertificatesData.length > 0 || changeLog.length > 0
  );
  const rescoreAfterImprovement = reactExports.useCallback(
    async ({ updatedResume, baselineScore, previousMissingSkills, rescoreSummary = null }) => {
      var _a2, _b, _c, _d, _e, _f;
      const resumeDraft = typeof updatedResume === "string" ? updatedResume : "";
      if (!resumeDraft.trim()) {
        return { delta: null, enhancedScore: null };
      }
      const payload = {
        resumeText: resumeDraft,
        jobDescriptionText,
        jobSkills,
        previousMissingSkills
      };
      if (typeof baselineScore === "number" && Number.isFinite(baselineScore)) {
        payload.baselineScore = baselineScore;
      }
      if (userIdentifier) {
        payload.userId = userIdentifier;
      }
      const requestUrl = buildApiUrl(API_BASE_URL, "/api/rescore-improvement");
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        const message = (errPayload == null ? void 0 : errPayload.message) || (errPayload == null ? void 0 : errPayload.error) || "Unable to refresh scores after applying the improvement.";
        throw new Error(message);
      }
      const data = await response.json();
      const summary = rescoreSummary && typeof rescoreSummary === "object" ? rescoreSummary : null;
      const overallSummary = summary && typeof summary.overall === "object" ? summary.overall : null;
      const selectionSummary = summary && typeof summary.selectionProbability === "object" ? summary.selectionProbability : null;
      const selectionInsightsSummary = summary && typeof summary.selectionInsights === "object" ? summary.selectionInsights : null;
      const extractSummaryMetrics = (section) => {
        if (!section || typeof section !== "object") {
          return [];
        }
        if (Array.isArray(section.atsSubScores)) {
          return orderAtsMetrics(section.atsSubScores);
        }
        if (Array.isArray(section.scoreBreakdown)) {
          return orderAtsMetrics(section.scoreBreakdown);
        }
        if (section.scoreBreakdown && typeof section.scoreBreakdown === "object") {
          return orderAtsMetrics(Object.values(section.scoreBreakdown));
        }
        return [];
      };
      const beforeSummaryMetrics = overallSummary ? extractSummaryMetrics(overallSummary.before) : [];
      const afterSummaryMetrics = overallSummary ? extractSummaryMetrics(overallSummary.after) : [];
      const deltaSummaryMetrics = overallSummary ? extractSummaryMetrics(overallSummary.delta) : [];
      const metricsByCategory = (list) => {
        if (!Array.isArray(list) || list.length === 0) {
          return /* @__PURE__ */ new Map();
        }
        return new Map(
          list.map((metric) => {
            const category = typeof (metric == null ? void 0 : metric.category) === "string" && metric.category.trim() ? metric.category.trim() : "";
            return category ? [category, metric] : null;
          }).filter(Boolean)
        );
      };
      const beforeMetricMap = metricsByCategory(beforeSummaryMetrics);
      const afterMetricMap = metricsByCategory(afterSummaryMetrics);
      const deltaMetricMap = metricsByCategory(deltaSummaryMetrics);
      const metrics = orderAtsMetrics(
        Array.isArray(data.atsSubScores) ? data.atsSubScores : Array.isArray(data.scoreBreakdown) ? data.scoreBreakdown : Object.values(data.scoreBreakdown || {})
      ).map((metric) => {
        var _a3;
        const enriched = {
          ...metric,
          tip: (metric == null ? void 0 : metric.tip) ?? ((_a3 = metric == null ? void 0 : metric.tips) == null ? void 0 : _a3[0]) ?? ""
        };
        const category = typeof (metric == null ? void 0 : metric.category) === "string" && metric.category.trim() ? metric.category.trim() : "";
        if (category) {
          const beforeMetric = beforeMetricMap.get(category);
          const afterMetric = afterMetricMap.get(category);
          const deltaMetric = deltaMetricMap.get(category);
          if (typeof (beforeMetric == null ? void 0 : beforeMetric.score) === "number" && Number.isFinite(beforeMetric.score)) {
            enriched.beforeScore = beforeMetric.score;
          }
          if (typeof (afterMetric == null ? void 0 : afterMetric.score) === "number" && Number.isFinite(afterMetric.score)) {
            enriched.afterScore = afterMetric.score;
          }
          if (typeof (deltaMetric == null ? void 0 : deltaMetric.score) === "number" && Number.isFinite(deltaMetric.score)) {
            enriched.deltaScore = deltaMetric.score;
            if (deltaMetric.score !== 0) {
              enriched.deltaText = formatScoreDelta(deltaMetric.score);
            }
          }
        }
        return enriched;
      });
      setScoreBreakdown(metrics);
      const nextResumeSkills = Array.isArray(data.resumeSkills) ? data.resumeSkills : [];
      setResumeSkills(nextResumeSkills);
      const normalizeSkillList = (value) => (Array.isArray(value) ? value : []).map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
      const previousMissingList = normalizeSkillList(previousMissingSkills);
      const responseCovered = normalizeSkillList(data.coveredSkills);
      const beforeSelectionValue = typeof (selectionSummary == null ? void 0 : selectionSummary.before) === "number" && Number.isFinite(selectionSummary.before) ? selectionSummary.before : null;
      const afterSelectionValue = typeof (selectionSummary == null ? void 0 : selectionSummary.after) === "number" && Number.isFinite(selectionSummary.after) ? selectionSummary.after : null;
      const beforeLevel = typeof (selectionSummary == null ? void 0 : selectionSummary.beforeLevel) === "string" ? selectionSummary.beforeLevel : null;
      const afterLevel = typeof (selectionSummary == null ? void 0 : selectionSummary.afterLevel) === "string" ? selectionSummary.afterLevel : null;
      const beforeMeaning = beforeLevel || deriveSelectionMeaning(beforeSelectionValue);
      const afterMeaning = afterLevel || deriveSelectionMeaning(afterSelectionValue);
      const beforeMessage = ((_a2 = selectionInsightsSummary == null ? void 0 : selectionInsightsSummary.before) == null ? void 0 : _a2.message) || ((_b = selectionInsightsSummary == null ? void 0 : selectionInsightsSummary.before) == null ? void 0 : _b.rationale) || null;
      const afterMessage = ((_c = selectionInsightsSummary == null ? void 0 : selectionInsightsSummary.after) == null ? void 0 : _c.message) || ((_d = selectionInsightsSummary == null ? void 0 : selectionInsightsSummary.after) == null ? void 0 : _d.rationale) || (selectionInsightsSummary == null ? void 0 : selectionInsightsSummary.message) || null;
      const beforeRationale = buildSelectionRationale(
        beforeSelectionValue,
        beforeMeaning,
        beforeMessage
      );
      const afterRationale = buildSelectionRationale(
        afterSelectionValue,
        afterMeaning,
        afterMessage
      );
      const selectionDelta = typeof (selectionSummary == null ? void 0 : selectionSummary.delta) === "number" && Number.isFinite(selectionSummary.delta) ? selectionSummary.delta : null;
      const selectionFactorList = Array.isArray(selectionInsightsSummary == null ? void 0 : selectionInsightsSummary.factors) ? selectionInsightsSummary.factors : Array.isArray(selectionSummary == null ? void 0 : selectionSummary.factors) ? selectionSummary.factors : null;
      setMatch((prev) => {
        var _a3, _b2, _c2;
        const base = prev || {};
        const nextMissing = Array.isArray(data.missingSkills) ? data.missingSkills : [];
        const missingLower = new Set(
          nextMissing.map((item) => typeof item === "string" ? item.toLowerCase() : "").filter(Boolean)
        );
        const newlyCovered = previousMissingList.filter((skill) => {
          const lower = skill.toLowerCase();
          return !missingLower.has(lower);
        });
        const combinedCovered = Array.from(
          new Set(
            [...newlyCovered, ...responseCovered].map((skill) => typeof skill === "string" ? skill.trim() : "").filter(Boolean)
          )
        );
        const existingAdded = Array.isArray(base.addedSkills) ? base.addedSkills : [];
        const mergedAdded = Array.from(
          new Set(
            [...existingAdded, ...combinedCovered].map((skill) => typeof skill === "string" ? skill.trim() : "").filter(Boolean)
          )
        );
        const enhancedScoreValue2 = typeof data.enhancedScore === "number" && Number.isFinite(data.enhancedScore) ? Math.round(data.enhancedScore) : base.enhancedScore;
        const nextTable = Array.isArray(data.table) ? data.table : base.table || [];
        const updatedMatch = {
          ...base,
          table: nextTable,
          missingSkills: nextMissing,
          addedSkills: mergedAdded,
          enhancedScore: enhancedScoreValue2
        };
        if (overallSummary) {
          const overallBeforeScore = typeof ((_a3 = overallSummary.before) == null ? void 0 : _a3.score) === "number" && Number.isFinite(overallSummary.before.score) ? overallSummary.before.score : null;
          const overallAfterScore = typeof ((_b2 = overallSummary.after) == null ? void 0 : _b2.score) === "number" && Number.isFinite(overallSummary.after.score) ? overallSummary.after.score : null;
          if (overallBeforeScore !== null) {
            updatedMatch.originalScore = overallBeforeScore;
            updatedMatch.atsScoreBefore = overallBeforeScore;
          }
          if (overallAfterScore !== null) {
            updatedMatch.enhancedScore = overallAfterScore;
            updatedMatch.atsScoreAfter = overallAfterScore;
          }
          const overallMissing = Array.isArray((_c2 = overallSummary.after) == null ? void 0 : _c2.missingSkills) ? overallSummary.after.missingSkills : null;
          if (overallMissing) {
            updatedMatch.missingSkills = overallMissing;
          }
        }
        if (selectionSummary || selectionInsightsSummary) {
          if (beforeSelectionValue !== null) {
            updatedMatch.selectionProbabilityBefore = beforeSelectionValue;
          }
          if (afterSelectionValue !== null) {
            updatedMatch.selectionProbability = afterSelectionValue;
            updatedMatch.selectionProbabilityAfter = afterSelectionValue;
          }
          if (beforeMeaning) {
            updatedMatch.selectionProbabilityBeforeMeaning = beforeMeaning;
          }
          if (afterMeaning) {
            updatedMatch.selectionProbabilityMeaning = afterMeaning;
            updatedMatch.selectionProbabilityAfterMeaning = afterMeaning;
          }
          if (beforeRationale !== null) {
            updatedMatch.selectionProbabilityBeforeRationale = beforeRationale;
          }
          if (afterRationale !== null) {
            updatedMatch.selectionProbabilityRationale = afterRationale;
            updatedMatch.selectionProbabilityAfterRationale = afterRationale;
          }
          if (selectionDelta !== null) {
            updatedMatch.selectionProbabilityDelta = selectionDelta;
          }
          if (selectionFactorList) {
            updatedMatch.selectionProbabilityFactors = cloneData(selectionFactorList);
          }
        }
        return updatedMatch;
      });
      if (selectionInsightsSummary) {
        setSelectionInsights(cloneData(selectionInsightsSummary));
      } else if (selectionSummary) {
        setSelectionInsights((prev) => {
          const next = {
            ...prev || {},
            before: { ...(prev == null ? void 0 : prev.before) || {} },
            after: { ...(prev == null ? void 0 : prev.after) || {} }
          };
          if (beforeSelectionValue !== null) {
            next.before.probability = beforeSelectionValue;
          }
          if (afterSelectionValue !== null) {
            next.after.probability = afterSelectionValue;
            next.probability = afterSelectionValue;
          }
          if (beforeMeaning) {
            next.before.level = beforeMeaning;
          }
          if (afterMeaning) {
            next.after.level = afterMeaning;
            next.level = afterMeaning;
          }
          if (beforeRationale !== null) {
            next.before.message = beforeRationale;
            next.before.rationale = beforeRationale;
          }
          if (afterRationale !== null) {
            next.after.message = afterRationale;
            next.after.rationale = afterRationale;
            next.message = afterRationale;
          }
          if (selectionDelta !== null) {
            next.delta = selectionDelta;
          }
          if (selectionFactorList) {
            next.factors = cloneData(selectionFactorList);
          }
          return next;
        });
      }
      const baselineValid = typeof baselineScore === "number" && Number.isFinite(baselineScore);
      const enhancedValid = typeof data.enhancedScore === "number" && Number.isFinite(data.enhancedScore);
      const computedDelta = baselineValid && enhancedValid ? data.enhancedScore - baselineScore : null;
      const overallDelta = typeof ((_e = overallSummary == null ? void 0 : overallSummary.delta) == null ? void 0 : _e.score) === "number" && Number.isFinite(overallSummary.delta.score) ? overallSummary.delta.score : null;
      const finalDelta = overallDelta !== null ? overallDelta : computedDelta;
      const enhancedScoreValue = typeof ((_f = overallSummary == null ? void 0 : overallSummary.after) == null ? void 0 : _f.score) === "number" && Number.isFinite(overallSummary.after.score) ? overallSummary.after.score : enhancedValid ? data.enhancedScore : null;
      return { delta: finalDelta, enhancedScore: enhancedScoreValue };
    },
    [API_BASE_URL, jobDescriptionText, jobSkills, userIdentifier]
  );
  const runQueuedImprovementRescore = reactExports.useCallback(async () => {
    const queue = pendingImprovementRescoreRef.current;
    if (!Array.isArray(queue) || queue.length === 0) {
      return false;
    }
    if (scoreUpdateLockRef.current) {
      setError(SCORE_UPDATE_IN_PROGRESS_MESSAGE, { stage: "score" });
      return false;
    }
    scoreUpdateLockRef.current = true;
    try {
      while (queue.length > 0) {
        const entry = queue[0];
        if (!entry || !entry.updatedResume) {
          queue.shift();
          continue;
        }
        const {
          id: id2,
          updatedResume,
          baselineScore,
          previousMissingSkills,
          rescoreSummary,
          changeLogEntry,
          persistedEntryPayload
        } = entry;
        setImprovementResults(
          (prev) => prev.map(
            (item) => item.id === id2 ? { ...item, rescorePending: true, rescoreError: "" } : item
          )
        );
        try {
          const result = rescoreAfterImprovementRef.current ? await rescoreAfterImprovementRef.current({
            updatedResume,
            baselineScore,
            previousMissingSkills,
            rescoreSummary
          }) : null;
          const deltaValue = result && Number.isFinite(result.delta) ? result.delta : null;
          if (changeLogEntry && Number.isFinite(deltaValue)) {
            setChangeLog(
              (prev) => prev.map(
                (entryItem) => entryItem.id === changeLogEntry.id ? { ...entryItem, scoreDelta: deltaValue } : entryItem
              )
            );
            if (changeLogEntry.id) {
              try {
                const payloadWithDelta = persistedEntryPayload ? { ...persistedEntryPayload, scoreDelta: deltaValue } : { ...changeLogEntry, scoreDelta: deltaValue };
                if (persistChangeLogEntryRef.current) {
                  await persistChangeLogEntryRef.current(payloadWithDelta);
                }
              } catch (persistErr) {
                console.error("Updating change log entry failed", persistErr);
                const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(persistErr);
                const { logs: persistLogs, requestId: persistRequestId } = extractErrorMetadata(persistErr);
                setError(
                  persistErr.message || "Unable to update the change log entry.",
                  {
                    serviceError: serviceErrorSource,
                    errorCode,
                    logs: persistLogs,
                    requestId: persistRequestId,
                    stage: "score"
                  }
                );
              }
            }
          }
          setImprovementResults(
            (prev) => prev.map(
              (item) => item.id === id2 ? {
                ...item,
                rescorePending: false,
                scoreDelta: deltaValue,
                rescoreError: ""
              } : item
            )
          );
          queue.shift();
        } catch (err) {
          console.error("Improvement rescore failed", err);
          const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err);
          const { logs: improvementLogs, requestId: improvementRequestId } = extractErrorMetadata(err);
          setError(err.message || "Unable to update scores after applying improvement.", {
            serviceError: serviceErrorSource,
            errorCode,
            logs: improvementLogs,
            requestId: improvementRequestId,
            stage: "score"
          });
          setImprovementResults(
            (prev) => prev.map(
              (item) => item.id === id2 ? {
                ...item,
                rescorePending: false,
                rescoreError: err.message || "Unable to refresh ATS scores."
              } : item
            )
          );
          return false;
        }
      }
      return true;
    } finally {
      scoreUpdateLockRef.current = false;
    }
  }, [
    deriveServiceContextFromError,
    setArtifactsUploaded,
    setChangeLog,
    setError,
    setImprovementResults
  ]);
  reactExports.useEffect(() => {
    runQueuedImprovementRescoreRef.current = runQueuedImprovementRescore;
  }, [runQueuedImprovementRescore]);
  reactExports.useEffect(() => {
    rescoreAfterImprovementRef.current = rescoreAfterImprovement;
  }, [rescoreAfterImprovement]);
  const persistChangeLogEntry = reactExports.useCallback(
    async (entry) => {
      if (!entry || !jobId) {
        return null;
      }
      const payload = {
        jobId,
        entry
      };
      if (userIdentifier) {
        payload.userId = userIdentifier;
      }
      const response = await fetch(buildApiUrl(API_BASE_URL, "/api/change-log"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        const { message, code, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: "Unable to store the change log entry.",
          status: response.status
        });
        const error2 = new Error(message);
        if (code) {
          error2.code = code;
        }
        if (source) {
          error2.serviceError = source;
        }
        if (requestId) {
          error2.requestId = requestId;
        }
        if (Array.isArray(logs) && logs.length) {
          error2.logs = logs;
        }
        throw error2;
      }
      const data = await response.json();
      const entries = Array.isArray(data.changeLog) ? data.changeLog : [];
      setChangeLog(entries);
      return entries;
    },
    [API_BASE_URL, jobId, userIdentifier]
  );
  reactExports.useEffect(() => {
    persistChangeLogEntryRef.current = persistChangeLogEntry;
  }, [persistChangeLogEntry]);
  const applyImprovementSuggestion = reactExports.useCallback(
    async (suggestion) => {
      var _a2, _b;
      if (!suggestion || !suggestion.id) {
        return false;
      }
      const validationStatus = resolveImprovementValidationStatus(suggestion.validation);
      if (validationStatus === "failed") {
        const reason = ((_b = (_a2 = suggestion == null ? void 0 : suggestion.validation) == null ? void 0 : _a2.jobAlignment) == null ? void 0 : _b.reason) && suggestion.validation.jobAlignment.reason.trim() || "This improvement does not align with the job description. Review the suggestion before accepting.";
        setError(reason, { stage: "enhance" });
        return false;
      }
      if (scoreUpdateLockRef.current) {
        setError(SCORE_UPDATE_IN_PROGRESS_MESSAGE, { stage: "score" });
        return false;
      }
      scoreUpdateLockRef.current = true;
      setArtifactsUploaded(false);
      try {
        const id2 = suggestion.id;
        const updatedResumeDraft = suggestion.updatedResume || resumeText;
        const baselineScore = getBaselineScoreFromMatch(match);
        const previousMissingSkills = Array.isArray(match == null ? void 0 : match.missingSkills) ? match.missingSkills : [];
        const changeLogEntry = buildChangeLogEntry(suggestion);
        const queueEntry = {
          id: id2,
          updatedResume: updatedResumeDraft,
          baselineScore,
          previousMissingSkills,
          rescoreSummary: suggestion.rescoreSummary,
          changeLogEntry: null,
          persistedEntryPayload: null
        };
        const historySnapshot = {
          id: (changeLogEntry == null ? void 0 : changeLogEntry.id) || id2,
          suggestionId: id2,
          title: (suggestion == null ? void 0 : suggestion.title) || "Improvement Applied",
          type: (suggestion == null ? void 0 : suggestion.type) || "custom",
          timestamp: Date.now(),
          resumeBefore: resumeText,
          resumeAfter: updatedResumeDraft,
          matchBefore: match ? cloneData(match) : null,
          scoreBreakdownBefore: Array.isArray(scoreBreakdown) ? cloneData(scoreBreakdown) : [],
          resumeSkillsBefore: Array.isArray(resumeSkills) ? cloneData(resumeSkills) : [],
          changeLogBefore: Array.isArray(changeLog) ? cloneData(changeLog) : [],
          detail: (changeLogEntry == null ? void 0 : changeLogEntry.detail) || "",
          changeLabel: (changeLogEntry == null ? void 0 : changeLogEntry.label) || ""
        };
        setResumeHistory((prev) => {
          const filtered = Array.isArray(prev) ? prev.filter((entry) => entry.id !== historySnapshot.id) : [];
          return [historySnapshot, ...filtered];
        });
        let previousChangeLog = null;
        setImprovementResults(
          (prev) => prev.map(
            (item) => item.id === id2 ? { ...item, accepted: true, rescorePending: true, rescoreError: "" } : item
          )
        );
        const normalizedOriginalTitle = typeof suggestion.originalTitle === "string" ? suggestion.originalTitle.trim() : "";
        const normalizedModifiedTitle = typeof suggestion.modifiedTitle === "string" ? suggestion.modifiedTitle.trim() : "";
        if (normalizedOriginalTitle || normalizedModifiedTitle) {
          setMatch((prev) => {
            const base = prev ? { ...prev } : {};
            const currentOriginal = typeof (prev == null ? void 0 : prev.originalTitle) === "string" ? prev.originalTitle : "";
            const currentModified = typeof (prev == null ? void 0 : prev.modifiedTitle) === "string" ? prev.modifiedTitle : "";
            const shouldUpdateOriginal = normalizedOriginalTitle && normalizedOriginalTitle !== currentOriginal;
            const shouldUpdateModified = normalizedModifiedTitle && normalizedModifiedTitle !== currentModified;
            if (!shouldUpdateOriginal && !shouldUpdateModified) {
              return prev;
            }
            if (shouldUpdateOriginal) {
              base.originalTitle = normalizedOriginalTitle;
            }
            if (shouldUpdateModified) {
              base.modifiedTitle = normalizedModifiedTitle;
            }
            return base;
          });
        }
        if (updatedResumeDraft) {
          setResumeText(updatedResumeDraft);
        }
        let persistedEntryPayload = null;
        if (changeLogEntry) {
          queueEntry.changeLogEntry = cloneData(changeLogEntry);
          const entryPayload = { ...changeLogEntry };
          if (typeof historySnapshot.resumeBefore === "string") {
            entryPayload.resumeBeforeText = historySnapshot.resumeBefore;
          }
          if (typeof historySnapshot.resumeAfter === "string") {
            entryPayload.resumeAfterText = historySnapshot.resumeAfter;
          }
          const historyContextPayload = {};
          if (historySnapshot.matchBefore && typeof historySnapshot.matchBefore === "object") {
            historyContextPayload.matchBefore = cloneData(historySnapshot.matchBefore);
          }
          if (Array.isArray(historySnapshot.scoreBreakdownBefore)) {
            historyContextPayload.scoreBreakdownBefore = cloneData(
              historySnapshot.scoreBreakdownBefore
            );
          }
          if (Array.isArray(historySnapshot.resumeSkillsBefore)) {
            historyContextPayload.resumeSkillsBefore = historySnapshot.resumeSkillsBefore.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
          }
          if (Object.keys(historyContextPayload).length > 0) {
            entryPayload.historyContext = historyContextPayload;
          }
          persistedEntryPayload = entryPayload;
          queueEntry.persistedEntryPayload = cloneData(entryPayload);
          setChangeLog((prev) => {
            previousChangeLog = prev;
            if (prev.some((entry) => entry.id === entryPayload.id)) {
              return prev.map((entry) => entry.id === entryPayload.id ? { ...entry, ...entryPayload } : entry);
            }
            return [entryPayload, ...prev];
          });
          try {
            await persistChangeLogEntry(entryPayload);
          } catch (err) {
            console.error("Persisting change log entry failed", err);
            const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err);
            const { logs: persistLogs, requestId: persistRequestId } = extractErrorMetadata(err);
            setError(err.message || "Unable to store the change log entry.", {
              serviceError: serviceErrorSource,
              errorCode,
              logs: persistLogs,
              requestId: persistRequestId,
              stage: "enhance"
            });
            setChangeLog(previousChangeLog || []);
          }
        }
        pendingImprovementRescoreRef.current = [
          ...pendingImprovementRescoreRef.current.filter((entry) => (entry == null ? void 0 : entry.id) !== id2),
          {
            ...queueEntry,
            changeLogEntry: queueEntry.changeLogEntry ? cloneData(queueEntry.changeLogEntry) : null,
            persistedEntryPayload: queueEntry.persistedEntryPayload ? cloneData(queueEntry.persistedEntryPayload) : null
          }
        ];
        return true;
      } finally {
        scoreUpdateLockRef.current = false;
      }
    },
    [
      match,
      persistChangeLogEntry,
      rescoreAfterImprovement,
      resumeText,
      scoreBreakdown,
      resumeSkills,
      changeLog,
      setChangeLog,
      setError,
      setImprovementResults,
      setMatch,
      setResumeText
    ]
  );
  const handleDownloadPreviousVersion = reactExports.useCallback(
    (changeId) => {
      if (!changeId) {
        setError("Unable to download the previous version for this update.", {
          stage: "enhance"
        });
        return;
      }
      let historyEntry = resumeHistoryMap.get(changeId);
      if (!historyEntry) {
        const changeEntry = changeLog.find((entry) => (entry == null ? void 0 : entry.id) === changeId);
        if (changeEntry && typeof changeEntry.resumeBeforeText === "string") {
          historyEntry = {
            id: changeEntry.id,
            title: changeEntry.title || "Improvement Applied",
            resumeBefore: changeEntry.resumeBeforeText
          };
        }
      }
      if (!historyEntry || typeof historyEntry.resumeBefore !== "string") {
        setError("Previous version is unavailable for this update.", {
          stage: "enhance"
        });
        return;
      }
      if (typeof window === "undefined" || typeof document === "undefined") {
        setError("Download is not supported in this environment.", {
          stage: "enhance"
        });
        return;
      }
      const resumeContent = historyEntry.resumeBefore;
      const baseNameSource = historyEntry.title || "Resume";
      const safeBase = baseNameSource.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const baseName = safeBase || "resume";
      const stamp = new Date(historyEntry.timestamp || Date.now()).toISOString().replace(/[:.]/g, "-");
      const fileName = `${baseName}-previous-${stamp}.txt`;
      try {
        const blob = new Blob([resumeContent], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resetUiAfterDownload();
      } catch (err) {
        console.error("Unable to download previous resume version", err);
        setError("Unable to download the previous version. Please try again.", {
          stage: "enhance"
        });
      }
    },
    [changeLog, resetUiAfterDownload, resumeHistoryMap, setError]
  );
  const handleRevertChange = reactExports.useCallback(
    async (changeId) => {
      var _a2, _b, _c;
      if (!changeId) {
        setError("Unable to revert this update.", { stage: "enhance" });
        return;
      }
      let historyEntry = resumeHistoryMap.get(changeId);
      if (!historyEntry) {
        const changeEntry = changeLog.find((entry) => (entry == null ? void 0 : entry.id) === changeId);
        if (changeEntry && typeof changeEntry.resumeBeforeText === "string") {
          historyEntry = {
            id: changeEntry.id,
            title: changeEntry.title || "Improvement Applied",
            type: changeEntry.type || "custom",
            detail: changeEntry.detail || "",
            changeLabel: changeEntry.label || "",
            resumeBefore: changeEntry.resumeBeforeText,
            resumeAfter: changeEntry.resumeAfterText,
            timestamp: changeEntry.acceptedAt ? new Date(changeEntry.acceptedAt).getTime() : Date.now(),
            matchBefore: ((_a2 = changeEntry.historyContext) == null ? void 0 : _a2.matchBefore) || null,
            scoreBreakdownBefore: ((_b = changeEntry.historyContext) == null ? void 0 : _b.scoreBreakdownBefore) || [],
            resumeSkillsBefore: ((_c = changeEntry.historyContext) == null ? void 0 : _c.resumeSkillsBefore) || []
          };
        }
      }
      if (!historyEntry) {
        setError("Previous version is unavailable for this update.", {
          stage: "enhance"
        });
        return;
      }
      const previousResumeText = typeof historyEntry.resumeBefore === "string" ? historyEntry.resumeBefore : typeof historyEntry.resumeBeforeText === "string" ? historyEntry.resumeBeforeText : "";
      if (!previousResumeText) {
        setError("Previous version is unavailable for this update.", {
          stage: "enhance"
        });
        return;
      }
      const revertTimestamp = Date.now();
      const previousState = {
        resumeText,
        match: match ? cloneData(match) : null,
        scoreBreakdown: Array.isArray(scoreBreakdown) ? cloneData(scoreBreakdown) : [],
        resumeSkills: Array.isArray(resumeSkills) ? cloneData(resumeSkills) : [],
        changeLog: Array.isArray(changeLog) ? cloneData(changeLog) : []
      };
      const baseChangeLog = Array.isArray(historyEntry.changeLogBefore) ? cloneData(historyEntry.changeLogBefore) : Array.isArray(changeLog) ? cloneData(changeLog) : [];
      const existingEntry = changeLog.find((entry) => (entry == null ? void 0 : entry.id) === changeId) || null;
      const fallbackEntry = existingEntry || {
        id: historyEntry.id,
        title: historyEntry.title || "Improvement Applied",
        detail: historyEntry.detail || "Change reverted to the earlier version.",
        label: historyEntry.changeLabel || "fixed",
        type: historyEntry.type || "custom"
      };
      const revertedEntry = {
        ...fallbackEntry,
        reverted: true,
        revertedAt: revertTimestamp
      };
      const nextChangeLog = [
        revertedEntry,
        ...baseChangeLog.filter((entry) => (entry == null ? void 0 : entry.id) !== changeId)
      ];
      setResumeText(previousResumeText);
      setMatch(historyEntry.matchBefore ? cloneData(historyEntry.matchBefore) : null);
      setScoreBreakdown(
        Array.isArray(historyEntry.scoreBreakdownBefore) ? cloneData(historyEntry.scoreBreakdownBefore) : []
      );
      setResumeSkills(
        Array.isArray(historyEntry.resumeSkillsBefore) ? cloneData(historyEntry.resumeSkillsBefore) : []
      );
      setChangeLog(nextChangeLog);
      setResumeHistory(
        (prev) => prev.map(
          (entry) => entry.id === changeId ? { ...entry, reverted: true, revertedAt: revertTimestamp } : entry
        )
      );
      setImprovementResults(
        (prev) => prev.map(
          (item) => item.id === historyEntry.suggestionId ? {
            ...item,
            accepted: false,
            rescorePending: false,
            rescoreError: "",
            scoreDelta: null
          } : item
        )
      );
      pendingImprovementRescoreRef.current = pendingImprovementRescoreRef.current.filter(
        (entry) => (entry == null ? void 0 : entry.id) !== historyEntry.suggestionId
      );
      if (existingEntry) {
        try {
          await persistChangeLogEntry(revertedEntry);
        } catch (err) {
          console.error("Unable to persist change log revert", err);
          setError(
            (err == null ? void 0 : err.message) ? err.message : "Unable to mark the change as reverted. Please try again.",
            { stage: "enhance" }
          );
          setResumeText(previousState.resumeText);
          setMatch(previousState.match ? cloneData(previousState.match) : null);
          setScoreBreakdown(
            Array.isArray(previousState.scoreBreakdown) ? cloneData(previousState.scoreBreakdown) : []
          );
          setResumeSkills(
            Array.isArray(previousState.resumeSkills) ? cloneData(previousState.resumeSkills) : []
          );
          setChangeLog(previousState.changeLog);
          setResumeHistory(
            (prev) => prev.map(
              (entry) => entry.id === changeId ? { ...entry, reverted: false, revertedAt: void 0 } : entry
            )
          );
        }
      }
    },
    [
      changeLog,
      match,
      persistChangeLogEntry,
      resumeHistoryMap,
      resumeSkills,
      resumeText,
      scoreBreakdown,
      setError
    ]
  );
  const removeChangeLogEntry = reactExports.useCallback(
    async (entryId) => {
      if (!entryId || !jobId) {
        return null;
      }
      const payload = {
        jobId,
        remove: true,
        entryId
      };
      if (userIdentifier) {
        payload.userId = userIdentifier;
      }
      const response = await fetch(buildApiUrl(API_BASE_URL, "/api/change-log"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        const { message, code, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: "Unable to remove the change log entry.",
          status: response.status
        });
        const error2 = new Error(message);
        if (code) {
          error2.code = code;
        }
        if (source) {
          error2.serviceError = source;
        }
        if (requestId) {
          error2.requestId = requestId;
        }
        if (Array.isArray(logs) && logs.length) {
          error2.logs = logs;
        }
        throw error2;
      }
      const data = await response.json();
      const entries = Array.isArray(data.changeLog) ? data.changeLog : [];
      setChangeLog(entries);
      return entries;
    },
    [API_BASE_URL, jobId, userIdentifier]
  );
  const handleGenerateEnhancedDocs = reactExports.useCallback(async () => {
    var _a2, _b, _c, _d, _e, _f;
    if (!jobId) {
      setError("Upload your resume and job description before generating downloads.", {
        stage: "generate"
      });
      return;
    }
    if (!improvementsUnlocked) {
      setError("Complete the initial scoring and improvement review before generating downloads.", {
        stage: "generate"
      });
      return;
    }
    if (improvementsRequireAcceptance && (!hasAcceptedImprovement || !acceptedImprovementsValidated)) {
      const message = !hasAcceptedImprovement ? "Accept at least one improvement before generating the enhanced documents." : "Confirm the JD-aligned improvements before generating the enhanced documents.";
      setError(message, {
        stage: "generate"
      });
      return;
    }
    if (isGeneratingDocs) {
      return;
    }
    setIsGeneratingDocs(true);
    setError("", { stage: "generate" });
    setArtifactsUploaded(false);
    try {
      const {
        canonicalTemplate,
        canonicalPrimaryTemplate,
        canonicalSecondaryTemplate,
        canonicalCoverTemplate,
        canonicalCoverPrimaryTemplate,
        canonicalCoverSecondaryTemplate,
        canonicalTemplateList,
        canonicalCoverTemplateList,
        context: requestTemplateContext
      } = buildTemplateRequestContext(templateContext, selectedTemplate);
      const payload = {
        jobId,
        resumeText,
        originalResumeText: typeof (initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.originalResumeText) === "string" ? initialAnalysisSnapshot.originalResumeText : (initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.resumeText) || "",
        jobDescriptionText,
        jobSkills,
        resumeSkills,
        manualCertificates: manualCertificatesData,
        templateContext: requestTemplateContext,
        templateId: canonicalTemplate,
        template: canonicalTemplate,
        template1: canonicalPrimaryTemplate,
        template2: canonicalSecondaryTemplate,
        templates: canonicalTemplateList,
        coverTemplate: canonicalCoverTemplate,
        coverTemplate1: canonicalCoverPrimaryTemplate,
        coverTemplate2: canonicalCoverSecondaryTemplate,
        coverTemplates: canonicalCoverTemplateList,
        ...userIdentifier ? { userId: userIdentifier } : {},
        baseline: {
          table: cloneData(((_a2 = initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.match) == null ? void 0 : _a2.table) || []),
          missingSkills: cloneData(((_b = initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.match) == null ? void 0 : _b.missingSkills) || []),
          originalScore: ((_c = initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.match) == null ? void 0 : _c.originalScore) ?? ((_d = initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.match) == null ? void 0 : _d.enhancedScore) ?? null,
          score: ((_e = initialAnalysisSnapshot == null ? void 0 : initialAnalysisSnapshot.match) == null ? void 0 : _e.originalScore) ?? null
        }
      };
      const response = await fetch(buildApiUrl(API_BASE_URL, "/api/generate-enhanced-docs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        const errorMessages = extractServerMessages(errPayload);
        if (errorMessages.length > 0) {
          setQueuedMessage(errorMessages[errorMessages.length - 1]);
        } else {
          setQueuedMessage("");
        }
        const { message, code, isFriendly, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: CV_GENERATION_ERROR_MESSAGE,
          status: response.status
        });
        const finalMessage = !isFriendly && code && code !== "PROCESSING_FAILED" ? `${message} (${code})` : message;
        const error2 = new Error(finalMessage);
        if (code) {
          error2.code = code;
        }
        if (source) {
          error2.serviceError = source;
        }
        if (requestId) {
          error2.requestId = requestId;
        }
        if (Array.isArray(logs) && logs.length) {
          error2.logs = logs;
        }
        throw error2;
      }
      const data = await response.json();
      const serverMessages = extractServerMessages(data);
      if (serverMessages.length > 0) {
        setQueuedMessage(serverMessages[serverMessages.length - 1]);
      } else {
        setQueuedMessage("");
      }
      const urlsValue = normalizeOutputFiles(data.urls, {
        defaultExpiresAt: data == null ? void 0 : data.urlExpiresAt,
        defaultExpiresInSeconds: data == null ? void 0 : data.urlExpiresInSeconds,
        allowEmptyUrls: true
      });
      updateOutputFiles(urlsValue, { generatedAt: data == null ? void 0 : data.generatedAt });
      setArtifactsUploaded(Boolean((data == null ? void 0 : data.artifactsUploaded) || urlsValue.length > 0));
      const { drafts: generatedCoverLetterDrafts, originals: generatedCoverLetterOriginals } = deriveCoverLetterStateFromFiles(urlsValue);
      setCoverLetterDrafts(generatedCoverLetterDrafts);
      setCoverLetterOriginals(generatedCoverLetterOriginals);
      if (typeof data.jobId === "string" && data.jobId.trim()) {
        setJobId(data.jobId.trim());
      }
      const templateContextValue = normalizeTemplateContext(
        data && typeof data.templateContext === "object" ? data.templateContext : null
      );
      setTemplateContext(templateContextValue);
      setChangeLog((prev) => Array.isArray(data.changeLog) ? data.changeLog : prev);
      const selectionInsightsValue = data.selectionInsights || {};
      const selectionInsightsBefore = selectionInsightsValue.before || {};
      const selectionInsightsAfter = selectionInsightsValue.after || selectionInsightsValue;
      const probabilityBeforeValue = typeof data.selectionProbabilityBefore === "number" ? data.selectionProbabilityBefore : typeof (selectionInsightsBefore == null ? void 0 : selectionInsightsBefore.probability) === "number" ? selectionInsightsBefore.probability : null;
      const probabilityAfterValue = typeof data.selectionProbabilityAfter === "number" ? data.selectionProbabilityAfter : typeof data.selectionProbability === "number" ? data.selectionProbability : typeof (selectionInsightsAfter == null ? void 0 : selectionInsightsAfter.probability) === "number" ? selectionInsightsAfter.probability : null;
      const probabilityBeforeMeaning = (selectionInsightsBefore == null ? void 0 : selectionInsightsBefore.level) || deriveSelectionMeaning(probabilityBeforeValue);
      const probabilityAfterMeaning = (selectionInsightsAfter == null ? void 0 : selectionInsightsAfter.level) || (selectionInsightsValue == null ? void 0 : selectionInsightsValue.level) || deriveSelectionMeaning(probabilityAfterValue);
      const probabilityBeforeMessage = (selectionInsightsBefore == null ? void 0 : selectionInsightsBefore.message) || (selectionInsightsBefore == null ? void 0 : selectionInsightsBefore.rationale) || null;
      const probabilityAfterMessage = (selectionInsightsAfter == null ? void 0 : selectionInsightsAfter.message) || (selectionInsightsAfter == null ? void 0 : selectionInsightsAfter.rationale) || (selectionInsightsValue == null ? void 0 : selectionInsightsValue.message) || (selectionInsightsValue == null ? void 0 : selectionInsightsValue.rationale) || null;
      const probabilityBeforeRationale = buildSelectionRationale(
        probabilityBeforeValue,
        probabilityBeforeMeaning,
        probabilityBeforeMessage
      );
      const probabilityAfterRationale = buildSelectionRationale(
        probabilityAfterValue,
        probabilityAfterMeaning,
        probabilityAfterMessage
      );
      const probabilityDeltaValue = typeof data.selectionProbabilityDelta === "number" ? data.selectionProbabilityDelta : typeof probabilityBeforeValue === "number" && typeof probabilityAfterValue === "number" ? probabilityAfterValue - probabilityBeforeValue : null;
      const probabilityFactors = Array.isArray(data.selectionProbabilityFactors) ? data.selectionProbabilityFactors : Array.isArray(selectionInsightsValue == null ? void 0 : selectionInsightsValue.factors) ? selectionInsightsValue.factors : null;
      const probabilityValue = probabilityAfterValue;
      const probabilityMeaning = probabilityAfterMeaning;
      const probabilityRationale = probabilityAfterRationale;
      const originalScoreValue = normalizePercent(data.originalScore);
      const enhancedScoreValue = normalizePercent(data.enhancedScore) ?? originalScoreValue;
      setMatch((prev) => {
        const base = prev ? { ...prev } : {};
        base.table = Array.isArray(data.table) ? data.table : base.table || [];
        base.addedSkills = Array.isArray(data.addedSkills) ? data.addedSkills : base.addedSkills || [];
        base.missingSkills = Array.isArray(data.missingSkills) ? data.missingSkills : base.missingSkills || [];
        if (originalScoreValue !== null) {
          base.originalScore = originalScoreValue;
          base.atsScoreBefore = originalScoreValue;
        }
        if (enhancedScoreValue !== null) {
          base.enhancedScore = enhancedScoreValue;
          base.atsScoreAfter = enhancedScoreValue;
        }
        if (typeof data.atsScoreBefore === "number") {
          base.atsScoreBefore = data.atsScoreBefore;
        }
        if (typeof data.atsScoreAfter === "number") {
          base.atsScoreAfter = data.atsScoreAfter;
          base.enhancedScore = data.atsScoreAfter;
        }
        base.originalTitle = typeof data.originalTitle === "string" ? data.originalTitle : base.originalTitle || "";
        base.modifiedTitle = typeof data.modifiedTitle === "string" ? data.modifiedTitle : base.modifiedTitle || "";
        if (probabilityBeforeValue !== null) {
          base.selectionProbabilityBefore = probabilityBeforeValue;
        }
        if (probabilityAfterValue !== null) {
          base.selectionProbability = probabilityAfterValue;
          base.selectionProbabilityAfter = probabilityAfterValue;
        }
        if (probabilityBeforeMeaning) {
          base.selectionProbabilityBeforeMeaning = probabilityBeforeMeaning;
        }
        if (probabilityAfterMeaning) {
          base.selectionProbabilityMeaning = probabilityAfterMeaning;
          base.selectionProbabilityAfterMeaning = probabilityAfterMeaning;
        }
        if (probabilityBeforeRationale) {
          base.selectionProbabilityBeforeRationale = probabilityBeforeRationale;
        }
        if (probabilityAfterRationale) {
          base.selectionProbabilityRationale = probabilityAfterRationale;
          base.selectionProbabilityAfterRationale = probabilityAfterRationale;
        }
        if (probabilityDeltaValue !== null) {
          base.selectionProbabilityDelta = probabilityDeltaValue;
        }
        if (probabilityFactors) {
          base.selectionProbabilityFactors = cloneData(probabilityFactors);
        }
        return base;
      });
      const toMetricArray = (value) => {
        if (Array.isArray(value))
          return value;
        if (value && typeof value === "object")
          return Object.values(value);
        return [];
      };
      const breakdownCandidates = toMetricArray(
        data.atsSubScores || data.atsSubScoresAfter || data.scoreBreakdown
      );
      const baselineCandidates = toMetricArray(
        data.atsSubScoresBefore || data.baselineScoreBreakdown
      );
      if (baselineCandidates.length && baselineScoreBreakdown.length === 0) {
        const normalizedBaseline = orderAtsMetrics(baselineCandidates).map((metric) => {
          var _a3;
          return {
            ...metric,
            tip: (metric == null ? void 0 : metric.tip) ?? ((_a3 = metric == null ? void 0 : metric.tips) == null ? void 0 : _a3[0]) ?? ""
          };
        });
        setBaselineScoreBreakdown(normalizedBaseline);
      }
      const breakdownSource = breakdownCandidates.length ? breakdownCandidates : baselineCandidates.length ? baselineCandidates : [];
      const normalizedBreakdown = orderAtsMetrics(breakdownSource).map((metric) => {
        var _a3;
        return {
          ...metric,
          tip: (metric == null ? void 0 : metric.tip) ?? ((_a3 = metric == null ? void 0 : metric.tips) == null ? void 0 : _a3[0]) ?? ""
        };
      });
      setScoreBreakdown(normalizedBreakdown);
      const resumeTextValue = typeof data.resumeText === "string" ? data.resumeText : resumeText;
      setResumeText(resumeTextValue);
      const jobDescriptionValue = typeof data.jobDescriptionText === "string" ? data.jobDescriptionText : jobDescriptionText;
      setJobDescriptionText(jobDescriptionValue);
      const jobSkillsValue = Array.isArray(data.jobSkills) ? data.jobSkills : jobSkills;
      setJobSkills(jobSkillsValue);
      const resumeSkillsValue = Array.isArray(data.resumeSkills) ? data.resumeSkills : resumeSkills;
      setResumeSkills(resumeSkillsValue);
      const knownCertificatesValue = (((_f = data.certificateInsights) == null ? void 0 : _f.known) || []).map((cert) => ({
        ...cert,
        source: cert.source || "resume"
      }));
      setKnownCertificates(knownCertificatesValue);
      const manualCertificatesValue = data.manualCertificates || manualCertificatesData;
      setManualCertificatesData(manualCertificatesValue);
      setCertificateInsights(data.certificateInsights || certificateInsights);
      setSelectionInsights(selectionInsightsValue || selectionInsights);
    } catch (err) {
      console.error("Enhanced document generation failed", err);
      const message = typeof (err == null ? void 0 : err.message) === "string" && err.message.trim() || CV_GENERATION_ERROR_MESSAGE;
      const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err);
      const { logs: errorLogsValue, requestId: errorRequestId } = extractErrorMetadata(err);
      setError(message, {
        allowRetry: true,
        recovery: "generation",
        serviceError: serviceErrorSource,
        errorCode,
        logs: errorLogsValue,
        requestId: errorRequestId,
        stage: "generate"
      });
    } finally {
      setIsGeneratingDocs(false);
    }
  }, [
    API_BASE_URL,
    acceptedImprovementsValidated,
    hasAcceptedImprovement,
    improvementsRequireAcceptance,
    improvementsUnlocked,
    initialAnalysisSnapshot,
    isGeneratingDocs,
    jobDescriptionText,
    jobId,
    jobSkills,
    manualCertificatesData,
    userIdentifier,
    resumeSkills,
    resumeText,
    selectionInsights,
    certificateInsights,
    templateContext,
    updateOutputFiles,
    selectedTemplate,
    setArtifactsUploaded
  ]);
  const handleAcceptImprovement = reactExports.useCallback(
    async (id2) => {
      const suggestion = improvementResults.find((item) => item.id === id2);
      if (!suggestion) {
        return false;
      }
      const applied = await applyImprovementSuggestion(suggestion);
      if (applied) {
        await runQueuedImprovementRescore();
      }
      if (applied && suggestion.type === "enhance-all") {
        const summaryTextCandidate = formatEnhanceAllSummary(suggestion == null ? void 0 : suggestion.improvementSummary);
        const explanationText = typeof (suggestion == null ? void 0 : suggestion.explanation) === "string" ? suggestion.explanation : "";
        const summaryText = (summaryTextCandidate || explanationText || "").trim();
        setEnhanceAllSummaryText(summaryText);
      }
      return applied;
    },
    [applyImprovementSuggestion, improvementResults, runQueuedImprovementRescore]
  );
  const handleAcceptAllImprovements = reactExports.useCallback(async () => {
    const pendingSuggestions = improvementResults.filter((item) => item.accepted === null);
    if (pendingSuggestions.length === 0) {
      return;
    }
    setIsBulkAccepting(true);
    setError("", { stage: "enhance" });
    try {
      for (const suggestion of pendingSuggestions) {
        const applied = await applyImprovementSuggestion(suggestion);
        if (!applied) {
          break;
        }
        await runQueuedImprovementRescore();
        if (suggestion.type === "enhance-all") {
          const summaryTextCandidate = formatEnhanceAllSummary(suggestion == null ? void 0 : suggestion.improvementSummary);
          const explanationText = typeof (suggestion == null ? void 0 : suggestion.explanation) === "string" ? suggestion.explanation : "";
          const summaryText = (summaryTextCandidate || explanationText || "").trim();
          setEnhanceAllSummaryText(summaryText);
        }
      }
    } finally {
      setIsBulkAccepting(false);
    }
  }, [
    applyImprovementSuggestion,
    improvementResults,
    runQueuedImprovementRescore,
    setError
  ]);
  const handleToggleImprovementSelection = reactExports.useCallback((key) => {
    if (typeof key !== "string" || !key.trim()) {
      return;
    }
    const normalizedKey = key.trim();
    setSelectedImprovementKeys((prev) => {
      const existing = new Set(prev.filter((item) => typeof item === "string" && item.trim()));
      const isEnhanceAll = normalizedKey === "enhance-all";
      if (existing.has(normalizedKey)) {
        existing.delete(normalizedKey);
        return Array.from(existing);
      }
      if (isEnhanceAll) {
        return ["enhance-all"];
      }
      existing.delete("enhance-all");
      existing.add(normalizedKey);
      return Array.from(existing);
    });
  }, []);
  const handleSelectAllImprovements = reactExports.useCallback(() => {
    const selectable = improvementActions.map((action) => action.key).filter((key) => key && key !== "enhance-all");
    setSelectedImprovementKeys(selectable);
  }, []);
  const handleClearImprovementSelection = reactExports.useCallback(() => {
    setSelectedImprovementKeys([]);
  }, []);
  const executeImprovementRequest = reactExports.useCallback(
    async (requestTypes = []) => {
      var _a2;
      const normalizedTypes = Array.isArray(requestTypes) ? requestTypes.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean) : [];
      if (normalizedTypes.length === 0) {
        return;
      }
      const allowedKeys = new Set(improvementActions.map((action) => action.key));
      let types = Array.from(new Set(normalizedTypes.filter((key) => allowedKeys.has(key))));
      if (!types.length) {
        return;
      }
      if (!types.includes("enhance-all")) {
        setEnhanceAllSummaryText("");
      }
      if (types.includes("enhance-all") && types.length > 1) {
        types = ["enhance-all"];
      }
      const shouldUseImproveAll = types.includes("enhance-all") || IMPROVE_ALL_BATCH_KEYS.length > 0 && IMPROVE_ALL_BATCH_KEYS.every((key) => types.includes(key));
      const requestTypesNormalized = shouldUseImproveAll ? IMPROVE_ALL_BATCH_KEYS : types;
      const requestPath = shouldUseImproveAll ? "/api/improve-all" : "/api/improve-batch";
      if (improvementLockRef.current) {
        setError("Please wait for the current improvement to finish before requesting another one.", {
          stage: "enhance"
        });
        return;
      }
      if (!jobId) {
        setError("Upload your resume and complete scoring before requesting improvements.", {
          stage: "enhance"
        });
        return;
      }
      if (!improvementAvailable) {
        setError(
          improvementUnlockMessage || "Complete the initial analysis before requesting improvements.",
          { stage: "enhance" }
        );
        return;
      }
      improvementLockRef.current = true;
      const isBatchRequest = requestTypesNormalized.length > 1;
      const activeImprovementKey = shouldUseImproveAll ? types.includes("enhance-all") ? "enhance-all" : "batch" : isBatchRequest ? "batch" : types[0];
      setActiveImprovement(activeImprovementKey);
      setActiveImprovementBatchKeys(isBatchRequest ? requestTypesNormalized : []);
      setError("", { stage: "enhance" });
      try {
        const requestUrl = buildApiUrl(API_BASE_URL, requestPath);
        const selectionTargetTitle = typeof ((_a2 = selectionInsights == null ? void 0 : selectionInsights.designation) == null ? void 0 : _a2.targetTitle) === "string" ? selectionInsights.designation.targetTitle.trim() : "";
        const matchModifiedTitle = typeof (match == null ? void 0 : match.modifiedTitle) === "string" ? match.modifiedTitle.trim() : "";
        const matchOriginalTitle = typeof (match == null ? void 0 : match.originalTitle) === "string" ? match.originalTitle.trim() : "";
        const targetJobTitle = selectionTargetTitle || parsedJobTitle || matchModifiedTitle || matchOriginalTitle;
        const currentResumeTitle = matchModifiedTitle || matchOriginalTitle;
        const {
          canonicalTemplate,
          canonicalPrimaryTemplate,
          canonicalSecondaryTemplate,
          canonicalCoverTemplate,
          canonicalCoverPrimaryTemplate,
          canonicalCoverSecondaryTemplate,
          canonicalTemplateList,
          canonicalCoverTemplateList,
          context: requestTemplateContext
        } = buildTemplateRequestContext(templateContext, selectedTemplate);
        const payload = {
          jobId,
          resumeText,
          jobDescription: jobDescriptionText,
          jobTitle: targetJobTitle,
          currentTitle: currentResumeTitle,
          originalTitle: matchOriginalTitle,
          jobSkills,
          resumeSkills,
          missingSkills: (match == null ? void 0 : match.missingSkills) || [],
          knownCertificates,
          manualCertificates: manualCertificatesData,
          templateContext: cloneData(requestTemplateContext),
          templateId: canonicalTemplate,
          template: canonicalTemplate,
          template1: canonicalPrimaryTemplate,
          template2: canonicalSecondaryTemplate,
          templates: canonicalTemplateList,
          coverTemplate: canonicalCoverTemplate,
          coverTemplate1: canonicalCoverPrimaryTemplate,
          coverTemplate2: canonicalCoverSecondaryTemplate,
          coverTemplates: canonicalCoverTemplateList,
          types: requestTypesNormalized,
          toggles: requestTypesNormalized,
          primaryType: requestTypesNormalized[0]
        };
        if (manualCertificatesInput.trim()) {
          payload.manualCertificates = manualCertificatesInput.trim();
        }
        if (userIdentifier) {
          payload.userId = userIdentifier;
        }
        const response = await fetch(requestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}));
          const { message, code, source, logs, requestId } = resolveApiError({
            data: errPayload,
            fallback: response.status >= 500 ? CV_GENERATION_ERROR_MESSAGE : "Unable to generate improvement.",
            status: response.status
          });
          const error2 = new Error(message);
          if (code) {
            error2.code = code;
          }
          if (source) {
            error2.serviceError = source;
          }
          if (requestId) {
            error2.requestId = requestId;
          }
          if (Array.isArray(logs) && logs.length) {
            error2.logs = logs;
          }
          throw error2;
        }
        const data = await response.json();
        const urlsValue = normalizeOutputFiles(data.urls || data.assetUrls, {
          defaultExpiresAt: data == null ? void 0 : data.urlExpiresAt,
          defaultExpiresInSeconds: data == null ? void 0 : data.urlExpiresInSeconds,
          allowEmptyUrls: true
        });
        if (urlsValue.length) {
          updateOutputFiles(urlsValue, { generatedAt: data == null ? void 0 : data.generatedAt });
          const {
            drafts: improvementCoverDrafts,
            originals: improvementCoverOriginals
          } = deriveCoverLetterStateFromFiles(urlsValue);
          setCoverLetterDrafts(improvementCoverDrafts);
          setCoverLetterOriginals(improvementCoverOriginals);
          setDownloadStates({});
        }
        setArtifactsUploaded(Boolean(data == null ? void 0 : data.artifactsUploaded));
        const templateContextValue = normalizeTemplateContext(
          data && typeof data.templateContext === "object" ? data.templateContext : null
        );
        if (templateContextValue) {
          setTemplateContext(templateContextValue);
        }
        const results = Array.isArray(data.results) ? data.results : [data];
        let latestEnhanceAllSummary = "";
        const suggestionsToAdd = results.map((item, index2) => {
          var _a3;
          const entryType = typeof (item == null ? void 0 : item.type) === "string" && item.type.trim() ? item.type.trim() : types[Math.min(index2, types.length - 1)];
          const improvementSummary = Array.isArray(item == null ? void 0 : item.improvementSummary) ? item.improvementSummary : [];
          const enhanceAllSummaryCandidate = entryType === "enhance-all" && improvementSummary.length ? formatEnhanceAllSummary(improvementSummary) : "";
          let explanation = typeof (item == null ? void 0 : item.explanation) === "string" && item.explanation.trim() || "Change generated successfully.";
          if (entryType === "enhance-all" && improvementSummary.length && enhanceAllSummaryCandidate) {
            const meaningfulBase = explanation && !/^applied deterministic improvements/i.test(explanation);
            explanation = meaningfulBase ? `${explanation} ${enhanceAllSummaryCandidate}` : enhanceAllSummaryCandidate;
            latestEnhanceAllSummary = enhanceAllSummaryCandidate;
          }
          const originalTitle = typeof (item == null ? void 0 : item.originalTitle) === "string" ? item.originalTitle.trim() : "";
          const modifiedTitle = typeof (item == null ? void 0 : item.modifiedTitle) === "string" ? item.modifiedTitle.trim() : "";
          return {
            id: `${entryType}-${Date.now()}-${index2}`,
            type: entryType,
            title: (item == null ? void 0 : item.title) || ((_a3 = improvementActions.find((action) => action.key === entryType)) == null ? void 0 : _a3.label) || "Improvement",
            beforeExcerpt: (item == null ? void 0 : item.beforeExcerpt) || "",
            afterExcerpt: (item == null ? void 0 : item.afterExcerpt) || "",
            explanation,
            updatedResume: (item == null ? void 0 : item.updatedResume) || resumeText,
            confidence: typeof (item == null ? void 0 : item.confidence) === "number" ? item.confidence : 0.6,
            accepted: null,
            originalTitle,
            modifiedTitle,
            improvementSummary,
            rescoreSummary: normalizeRescoreSummary((item == null ? void 0 : item.rescore) || (item == null ? void 0 : item.rescoreSummary)),
            scoreDelta: null,
            rescorePending: false,
            rescoreError: "",
            validation: normalizeImprovementValidation(item == null ? void 0 : item.validation)
          };
        });
        if (latestEnhanceAllSummary) {
          setEnhanceAllSummaryText(latestEnhanceAllSummary);
        }
        if (suggestionsToAdd.length) {
          setImprovementResults((prev) => [...suggestionsToAdd, ...prev]);
        }
        setSelectedImprovementKeys(
          (prev) => prev.filter((key) => !types.includes(key))
        );
      } catch (err) {
        console.error("Improvement request failed", err);
        const errorMessage = typeof (err == null ? void 0 : err.message) === "string" && err.message.trim() || CV_GENERATION_ERROR_MESSAGE;
        const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err);
        const { logs: improvementLogs, requestId: improvementRequestId } = extractErrorMetadata(err);
        setError(errorMessage, {
          serviceError: serviceErrorSource,
          errorCode,
          logs: improvementLogs,
          requestId: improvementRequestId,
          stage: "enhance"
        });
        if (types.includes("enhance-all")) {
          setEnhanceAllSummaryText("");
        }
      } finally {
        setActiveImprovement("");
        setActiveImprovementBatchKeys([]);
        improvementLockRef.current = false;
      }
    },
    [
      API_BASE_URL,
      buildTemplateRequestContext,
      cloneData,
      deriveCoverLetterStateFromFiles,
      deriveServiceContextFromError,
      improvementActions,
      improvementAvailable,
      improvementLockRef,
      improvementUnlockMessage,
      jobDescriptionText,
      jobId,
      jobSkills,
      knownCertificates,
      manualCertificatesData,
      manualCertificatesInput,
      match,
      normalizeOutputFiles,
      normalizeRescoreSummary,
      normalizeTemplateContext,
      parsedJobTitle,
      resumeText,
      resumeSkills,
      selectionInsights,
      selectedTemplate,
      formatEnhanceAllSummary,
      setActiveImprovement,
      setActiveImprovementBatchKeys,
      setArtifactsUploaded,
      setCoverLetterDrafts,
      setCoverLetterOriginals,
      setDownloadStates,
      setEnhanceAllSummaryText,
      setError,
      setImprovementResults,
      setSelectedImprovementKeys,
      setTemplateContext,
      templateContext,
      updateOutputFiles,
      userIdentifier
    ]
  );
  const handleImprovementClick = async (type) => {
    if (typeof type !== "string" || !type.trim()) {
      return;
    }
    await executeImprovementRequest([type.trim()]);
  };
  const handleRunSelectedImprovements = reactExports.useCallback(async () => {
    if (!selectedImprovementKeys.length) {
      return;
    }
    await executeImprovementRequest(selectedImprovementKeys);
  }, [executeImprovementRequest, selectedImprovementKeys]);
  const handleRejectImprovement = async (id2) => {
    var _a2, _b, _c;
    const targetSuggestion = improvementResults.find((item) => item.id === id2);
    if (!targetSuggestion) {
      return false;
    }
    const wasAccepted = targetSuggestion.accepted === true;
    if (wasAccepted && scoreUpdateLockRef.current) {
      setError(SCORE_UPDATE_IN_PROGRESS_MESSAGE, { stage: "score" });
      return false;
    }
    const previousEnhanceAllSummaryText = enhanceAllSummaryText;
    const previousImprovementResults = cloneData(improvementResults);
    const previousChangeLogState = cloneData(changeLog);
    const previousResumeTextValue = resumeText;
    const previousMatchValue = match ? cloneData(match) : null;
    const previousScoreBreakdownValue = Array.isArray(scoreBreakdown) ? cloneData(scoreBreakdown) : [];
    const previousResumeSkillsValue = Array.isArray(resumeSkills) ? cloneData(resumeSkills) : [];
    const previousResumeHistoryValue = Array.isArray(resumeHistory) ? cloneData(resumeHistory) : [];
    let historyEntry = null;
    let revertResumeText = "";
    let revertMatch = null;
    let revertScoreBreakdown = [];
    let revertResumeSkills = [];
    if (wasAccepted) {
      historyEntry = resumeHistoryMap.get(id2) || null;
      if (!historyEntry) {
        const changeEntry = changeLog.find((entry) => (entry == null ? void 0 : entry.id) === id2);
        if (changeEntry && typeof changeEntry.resumeBeforeText === "string") {
          historyEntry = {
            id: changeEntry.id,
            suggestionId: changeEntry.id,
            title: changeEntry.title || "Improvement Applied",
            type: changeEntry.type || "custom",
            detail: changeEntry.detail || "",
            changeLabel: changeEntry.label || "",
            resumeBefore: changeEntry.resumeBeforeText,
            resumeAfter: changeEntry.resumeAfterText,
            timestamp: changeEntry.acceptedAt ? new Date(changeEntry.acceptedAt).getTime() : Date.now(),
            matchBefore: ((_a2 = changeEntry.historyContext) == null ? void 0 : _a2.matchBefore) || null,
            scoreBreakdownBefore: ((_b = changeEntry.historyContext) == null ? void 0 : _b.scoreBreakdownBefore) || [],
            resumeSkillsBefore: ((_c = changeEntry.historyContext) == null ? void 0 : _c.resumeSkillsBefore) || []
          };
        }
      }
      const previousResumeText = historyEntry ? typeof historyEntry.resumeBefore === "string" && historyEntry.resumeBefore ? historyEntry.resumeBefore : typeof historyEntry.resumeBeforeText === "string" ? historyEntry.resumeBeforeText : "" : "";
      if (!historyEntry || !previousResumeText) {
        setError("Previous version is unavailable for this update.", {
          stage: "enhance"
        });
        return false;
      }
      revertResumeText = previousResumeText;
      revertMatch = historyEntry.matchBefore ? cloneData(historyEntry.matchBefore) : null;
      revertScoreBreakdown = Array.isArray(historyEntry.scoreBreakdownBefore) ? cloneData(historyEntry.scoreBreakdownBefore) : [];
      revertResumeSkills = Array.isArray(historyEntry.resumeSkillsBefore) ? historyEntry.resumeSkillsBefore.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean) : [];
    }
    if ((targetSuggestion == null ? void 0 : targetSuggestion.type) === "enhance-all") {
      setEnhanceAllSummaryText("");
    }
    const shouldRescore = wasAccepted && typeof revertResumeText === "string" && revertResumeText.trim().length > 0;
    const releaseLock = wasAccepted;
    if (releaseLock) {
      scoreUpdateLockRef.current = true;
    }
    let success = false;
    try {
      setImprovementResults(
        (prev) => prev.map(
          (item) => item.id === id2 ? {
            ...item,
            accepted: false,
            rescorePending: shouldRescore,
            rescoreError: "",
            scoreDelta: null
          } : item
        )
      );
      setChangeLog((prev) => prev.filter((entry) => entry.id !== id2));
      setResumeHistory((prev) => prev.filter((entry) => entry.id !== id2));
      if (wasAccepted) {
        setResumeText(revertResumeText);
        setMatch(revertMatch ? cloneData(revertMatch) : null);
        setScoreBreakdown(revertScoreBreakdown);
        setResumeSkills(revertResumeSkills);
      }
      if (shouldRescore) {
        const revertBaselineScore = getBaselineScoreFromMatch(revertMatch);
        const revertMissingSkills = Array.isArray(revertMatch == null ? void 0 : revertMatch.missingSkills) ? revertMatch.missingSkills : [];
        pendingImprovementRescoreRef.current = [
          ...pendingImprovementRescoreRef.current.filter((entry) => (entry == null ? void 0 : entry.id) !== id2),
          {
            id: id2,
            updatedResume: revertResumeText,
            baselineScore: revertBaselineScore,
            previousMissingSkills: revertMissingSkills,
            rescoreSummary: null,
            changeLogEntry: null,
            persistedEntryPayload: null
          }
        ];
      } else {
        pendingImprovementRescoreRef.current = pendingImprovementRescoreRef.current.filter(
          (entry) => (entry == null ? void 0 : entry.id) !== id2
        );
      }
      try {
        await removeChangeLogEntry(id2);
        success = true;
      } catch (err) {
        console.error("Removing change log entry failed", err);
        const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err);
        const { logs: removalLogs, requestId: removalRequestId } = extractErrorMetadata(err);
        setError(err.message || "Unable to remove the change log entry.", {
          serviceError: serviceErrorSource,
          errorCode,
          logs: removalLogs,
          requestId: removalRequestId,
          stage: "enhance"
        });
        setChangeLog(previousChangeLogState || []);
        setImprovementResults(previousImprovementResults || []);
        setResumeHistory(previousResumeHistoryValue || []);
        if ((targetSuggestion == null ? void 0 : targetSuggestion.type) === "enhance-all") {
          setEnhanceAllSummaryText(previousEnhanceAllSummaryText);
        }
        if (wasAccepted) {
          setResumeText(previousResumeTextValue);
          setMatch(previousMatchValue ? cloneData(previousMatchValue) : null);
          setScoreBreakdown(previousScoreBreakdownValue);
          setResumeSkills(previousResumeSkillsValue);
        }
        return false;
      }
    } finally {
      if (releaseLock) {
        scoreUpdateLockRef.current = false;
      }
    }
    return success;
  };
  const handlePreviewImprovement = reactExports.useCallback(
    (suggestion) => {
      if (!suggestion)
        return;
      const previewEntry = buildChangeLogEntry(suggestion);
      setPreviewActionBusy(false);
      setPreviewActiveAction("");
      setPreviewSuggestion({
        id: suggestion.id,
        title: suggestion.title,
        updatedResume: suggestion.updatedResume || "",
        beforeExcerpt: suggestion.beforeExcerpt || "",
        afterExcerpt: suggestion.afterExcerpt || "",
        explanation: suggestion.explanation || "",
        baseResume: resumeText,
        summarySegments: (previewEntry == null ? void 0 : previewEntry.summarySegments) || suggestion.improvementSummary || [],
        addedItems: (previewEntry == null ? void 0 : previewEntry.addedItems) || [],
        removedItems: (previewEntry == null ? void 0 : previewEntry.removedItems) || [],
        itemizedChanges: (previewEntry == null ? void 0 : previewEntry.itemizedChanges) || []
      });
    },
    [resumeText]
  );
  const previewedSuggestion = reactExports.useMemo(() => {
    if (!previewSuggestion)
      return null;
    return improvementResults.find((item) => item.id === previewSuggestion.id) || null;
  }, [previewSuggestion, improvementResults]);
  const previewAcceptDisabled = previewActionBusy || !previewedSuggestion || previewedSuggestion.accepted === true || previewedSuggestion.rescorePending === true;
  const previewRejectDisabled = previewActionBusy || !previewedSuggestion;
  const previewAcceptLabel = (previewedSuggestion == null ? void 0 : previewedSuggestion.accepted) ? "Applied" : previewActiveAction === "accept" ? "Applying…" : "Accept Change";
  const previewRejectLabel = previewActiveAction === "reject" ? "Rejecting…" : "Reject";
  const handlePreviewDecision = reactExports.useCallback(
    async (action) => {
      if (!previewSuggestion) {
        return;
      }
      if (!previewedSuggestion) {
        setError("This improvement is no longer available.", { stage: "enhance" });
        return;
      }
      setPreviewActiveAction(action);
      setPreviewActionBusy(true);
      try {
        let result = false;
        if (action === "accept") {
          result = await handleAcceptImprovement(previewedSuggestion.id);
        } else if (action === "reject") {
          result = await handleRejectImprovement(previewedSuggestion.id);
        }
        if (result !== false) {
          closePreview();
        }
      } catch (err) {
        console.error("Unable to update improvement from preview", err);
        const fallbackMessage = action === "reject" ? "Unable to reject this improvement from the preview." : "Unable to accept this improvement from the preview.";
        const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err);
        const { logs: previewLogs, requestId: previewRequestId } = extractErrorMetadata(err);
        setError((err == null ? void 0 : err.message) || fallbackMessage, {
          serviceError: serviceErrorSource,
          errorCode,
          logs: previewLogs,
          requestId: previewRequestId,
          stage: "enhance"
        });
      } finally {
        setPreviewActionBusy(false);
        setPreviewActiveAction("");
      }
    },
    [
      previewSuggestion,
      previewedSuggestion,
      handleAcceptImprovement,
      handleRejectImprovement,
      closePreview,
      setError
    ]
  );
  const handlePreviewAccept = reactExports.useCallback(() => handlePreviewDecision("accept"), [handlePreviewDecision]);
  const handlePreviewReject = reactExports.useCallback(() => handlePreviewDecision("reject"), [handlePreviewDecision]);
  const jobDescriptionReady = hasManualJobDescriptionInput;
  const rescoreRequiresAcceptedChanges = improvementsRequireAcceptance && !hasAcceptedImprovement;
  const rescoreDisabled = !cvFile || isProcessing || !jobDescriptionReady || rescoreRequiresAcceptedChanges || isBulkAccepting;
  const rescoreButtonLabel = isProcessing ? "Scoring…" : hasPendingImprovementRescore ? "Rescore accepted updates" : scoreDashboardReady ? "Rescore CV" : "Run ATS scoring";
  const rescoreHelperMessage = (() => {
    if (rescoreRequiresAcceptedChanges) {
      return "Accept improvements before re-running ATS scoring.";
    }
    if (hasPendingImprovementRescore) {
      return "Rescore to apply accepted improvements to your ATS dashboard.";
    }
    return "";
  })();
  const metricsCount = Array.isArray(scoreBreakdown) ? scoreBreakdown.length : 0;
  const scoreStageCount = metricsCount > 0 ? metricsCount : matchHasSelectionProbability ? 1 : 0;
  const suggestionsCount = improvementResults.length;
  const changeLogCount = changeLog.length;
  const dashboardStageOptions = [
    { key: "score", label: "Scores", count: scoreStageCount, ready: scoreDashboardHasContent },
    { key: "suggestions", label: "Suggestions", count: suggestionsCount, ready: suggestionsCount > 0 },
    { key: "changelog", label: "Change Log", count: changeLogCount, ready: changeLogCount > 0 }
  ];
  const isEnhancementReviewPhase = currentPhase === "enhance" || currentPhase === "generate" || currentPhase === "download";
  const allowedDashboardStageKeys = reactExports.useMemo(() => {
    if (currentPhase === "score") {
      return ["score"];
    }
    if (isEnhancementReviewPhase) {
      return ["suggestions", "changelog"];
    }
    return [];
  }, [currentPhase, isEnhancementReviewPhase]);
  const filteredDashboardStageOptions = reactExports.useMemo(
    () => dashboardStageOptions.filter((stage) => allowedDashboardStageKeys.includes(stage.key)),
    [allowedDashboardStageKeys, dashboardStageOptions]
  );
  reactExports.useEffect(() => {
    if (filteredDashboardStageOptions.length === 0) {
      return;
    }
    setActiveDashboardStage((currentStage) => {
      var _a2;
      if (allowedDashboardStageKeys.includes(currentStage)) {
        if (currentStage === "suggestions" && improvementResults.length === 0 && allowedDashboardStageKeys.includes("changelog") && changeLog.length > 0) {
          return "changelog";
        }
        if (currentStage === "changelog" && changeLog.length === 0 && allowedDashboardStageKeys.includes("suggestions") && improvementResults.length > 0) {
          return "suggestions";
        }
        return currentStage;
      }
      return ((_a2 = filteredDashboardStageOptions[0]) == null ? void 0 : _a2.key) || currentStage;
    });
  }, [
    allowedDashboardStageKeys,
    changeLog.length,
    filteredDashboardStageOptions,
    improvementResults.length
  ]);
  const coverLetterEditorType = (coverLetterEditor == null ? void 0 : coverLetterEditor.type) || "";
  const coverLetterEditorFile = coverLetterEditor && coverLetterEditor.file || {};
  const coverLetterEditorTemplate = reactExports.useMemo(() => {
    if (!coverLetterEditor || !isCoverLetterType(coverLetterEditor.type)) {
      return null;
    }
    const selection = resolveCoverTemplateSelection({
      file: coverLetterEditor.file || {},
      type: coverLetterEditor.type,
      downloadTemplateMetadata,
      templateContext
    });
    return selection;
  }, [coverLetterEditor, downloadTemplateMetadata, templateContext]);
  const coverLetterEditorDraftText = coverLetterEditor ? resolveCoverLetterDraftText(
    coverLetterDrafts,
    coverLetterOriginals,
    coverLetterEditorType,
    coverLetterEditorFile
  ) : "";
  const coverLetterEditorOriginalText = coverLetterEditor ? coverLetterOriginals[coverLetterEditorType] ?? getCoverLetterTextFromFile(coverLetterEditorFile) : "";
  const coverLetterEditorHasChanges = Boolean(
    coverLetterEditor && coverLetterEditorDraftText !== coverLetterEditorOriginalText
  );
  const coverLetterEditorWordCount = coverLetterEditorDraftText.trim() ? coverLetterEditorDraftText.trim().split(/\s+/).filter(Boolean).length : 0;
  const handleCoverEditorChange = reactExports.useCallback(
    (value) => {
      if (!coverLetterEditor || !coverLetterEditorType) {
        return;
      }
      handleCoverLetterTextChange(coverLetterEditorType, value);
    },
    [coverLetterEditor, coverLetterEditorType, handleCoverLetterTextChange]
  );
  const handleCoverEditorReset = reactExports.useCallback(() => {
    if (!coverLetterEditor || !coverLetterEditorType) {
      return;
    }
    resetCoverLetterDraft(coverLetterEditorType);
  }, [coverLetterEditor, coverLetterEditorType, resetCoverLetterDraft]);
  const handleCoverEditorCopy = reactExports.useCallback(() => {
    if (!coverLetterEditor || !coverLetterEditorType) {
      return;
    }
    handleCopyCoverLetter(coverLetterEditorType, coverLetterEditorFile);
  }, [
    coverLetterEditor,
    coverLetterEditorType,
    coverLetterEditorFile,
    handleCopyCoverLetter
  ]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-gradient-to-br from-blue-200 via-purple-200 to-purple-300 flex flex-col items-center p-4 md:p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-5xl space-y-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "text-center space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-4xl md:text-5xl font-black text-purple-900 drop-shadow-sm", children: "ResumeForge ATS Optimiser" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-purple-800/90 max-w-2xl mx-auto", children: "Upload your CV, paste the job description, and instantly receive a five-metric ATS breakdown with tailored improvements you can accept or reject." })
    ] }),
    cloudfrontFallbackActive && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "section",
      {
        className: "rounded-3xl border border-amber-200 bg-amber-50/80 p-5 shadow-lg flex flex-col gap-2",
        role: "alert",
        "aria-live": "assertive",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base md:text-lg font-semibold text-amber-900", children: "CloudFront fallback active" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-amber-800", children: "We're serving ResumeForge directly from the API Gateway while the CDN recovers." }),
          cloudfrontMetadata.canonicalHost ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-amber-700", children: [
            "Primary CloudFront domain:",
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "font-mono break-all text-amber-900", children: cloudfrontMetadata.canonicalHost })
          ] }) : null,
          cloudfrontMetadata.apiGatewayUrl ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-amber-700", children: [
            "Share the backup endpoint if teammates can't reach the CDN:",
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "a",
              {
                href: cloudfrontMetadata.apiGatewayUrl,
                className: "font-semibold text-amber-900 underline-offset-2 hover:underline",
                target: "_blank",
                rel: "noopener noreferrer",
                children: cloudfrontMetadata.apiGatewayUrl
              }
            )
          ] }) : null,
          cloudfrontMetadata.updatedAt ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[0.65rem] uppercase tracking-[0.25em] text-amber-600", children: [
            "Metadata updated at ",
            cloudfrontMetadata.updatedAt
          ] }) : null,
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "hidden",
              name: "resumeforge-backup-api-base",
              "data-backup-api-base": true,
              value: cloudfrontMetadata.apiGatewayUrl || environmentOrigin || "",
              readOnly: true,
              "aria-hidden": "true"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ProcessFlow, { steps: flowSteps }),
    queuedMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-blue-700 text-center", children: queuedMessage }),
    isProcessing && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" }) }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-full flex-col items-center gap-4 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-red-600 text-sm font-semibold", children: error }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600", children: [
        typeof (errorContext == null ? void 0 : errorContext.code) === "string" && errorContext.code.trim() && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-red-50 px-3 py-1 font-semibold uppercase tracking-wide text-red-600", children: errorContext.code }),
        normalizeServiceSource(errorContext == null ? void 0 : errorContext.source) && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase tracking-wide text-slate-600", children: normalizeServiceSource(errorContext.source) }),
        typeof (errorContext == null ? void 0 : errorContext.requestId) === "string" && errorContext.requestId.trim() && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-600", children: [
          "Request: ",
          errorContext.requestId
        ] })
      ] }),
      errorLogs.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-xl space-y-2 rounded-2xl border border-slate-200 bg-white/80 p-4 text-left shadow-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Log references" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: errorLogs.map((log) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "rounded-xl bg-slate-50 px-3 py-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "uppercase tracking-wide text-slate-500", children: log.channel }),
            typeof log.status === "string" && log.status && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600", children: log.status })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 space-y-1 break-all text-xs text-slate-600", children: [
            log.location && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-500", children: "Location:" }),
              " ",
              log.location
            ] }),
            !log.location && log.bucket && log.key && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-500", children: "Bucket:" }),
              " ",
              log.bucket,
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-500", children: " · Key:" }),
              " ",
              log.key
            ] }),
            log.requestId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-500", children: "Request:" }),
              " ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "font-mono", children: log.requestId })
            ] }),
            log.message && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-500", children: "Note:" }),
              " ",
              log.message
            ] }),
            log.url && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-500", children: "URL:" }),
              " ",
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "a",
                {
                  href: log.url,
                  className: "text-blue-600 underline",
                  target: "_blank",
                  rel: "noreferrer",
                  children: log.url
                }
              )
            ] }),
            log.hint && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-500", children: "Hint:" }),
              " ",
              log.hint
            ] })
          ] })
        ] }, log.id)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-center gap-2", children: [
        errorRecovery === "generation" && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleGenerateEnhancedDocs,
            disabled: isGeneratingDocs,
            className: "inline-flex items-center justify-center rounded-full border border-purple-600 px-4 py-2 text-sm font-semibold text-purple-600 transition hover:bg-purple-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:cursor-not-allowed disabled:border-purple-300 disabled:text-purple-300",
            children: "Retry generation"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleExportErrorLog,
            className: "inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
            children: "Export log"
          }
        )
      ] })
    ] }),
    currentPhase === "upload" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "bg-white/80 backdrop-blur rounded-3xl border border-purple-200/60 shadow-xl p-6 md:p-8 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-purple-500", children: "Step 1 · Upload" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-2xl font-bold text-purple-900", children: "Upload your resume & target JD" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Drag in your CV, add the job description, and we'll automatically score all ATS metrics as soon as both are in place." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "w-full p-6 border-2 border-dashed border-purple-300 rounded-2xl text-center bg-gradient-to-r from-white to-purple-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400",
          onDragOver: (e) => e.preventDefault(),
          onDrop: handleDrop,
          onClick: handleUploadAreaClick,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleUploadAreaClick();
            }
          },
          role: "button",
          tabIndex: 0,
          "aria-label": "Upload resume by dragging and dropping or browsing for a file",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "file",
                accept: ".pdf,.doc,.docx",
                onChange: handleFileChange,
                className: "hidden",
                id: "cv-input",
                ref: cvInputRef
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-3", children: [
              cvFile ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-purple-900 font-semibold break-all", children: cvFile.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-center gap-2 text-xs font-semibold", children: [
                  formattedCvFileSize && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-purple-200/80 bg-white/80 px-3 py-1 text-purple-600", children: [
                    "File size · ",
                    formattedCvFileSize
                  ] }),
                  uploadStatusDetail.label && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "span",
                    {
                      className: `rounded-full border px-3 py-1 ${uploadStatusDetail.badgeClass}`,
                      children: [
                        "Status · ",
                        uploadStatusDetail.label
                      ]
                    }
                  )
                ] })
              ] }, "file-selected") : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold text-purple-800", children: "Drag & drop your CV" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-600", children: "or click to browse (PDF, DOC, or DOCX · max 5 MB)" })
              ] }, "no-file"),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-purple-600", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-purple-200/80 bg-white/80 px-3 py-1", children: "Drag & drop" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-purple-200/80 bg-white/80 px-3 py-1", children: "Browse files" })
              ] }),
              !cvFile && uploadStatusDetail.label && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `rounded-full border px-3 py-1 text-xs font-semibold ${uploadStatusDetail.badgeClass}`,
                  children: uploadStatusDetail.label
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-xs font-medium text-purple-600", children: uploadStatusMessage })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "md:col-span-2 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-sm font-semibold text-purple-700", htmlFor: "manual-job-description", children: [
            "Paste Full Job Description",
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: manualJobDescriptionHasError ? "text-rose-600" : "text-purple-500", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              id: "manual-job-description",
              value: manualJobDescription,
              onChange: (e) => setManualJobDescription(e.target.value),
              placeholder: "Paste the entire job post here.",
              className: `w-full h-32 p-3 rounded-xl border focus:outline-none focus:ring-2 ${manualJobDescriptionHasError ? "border-rose-300 focus:ring-rose-400" : "border-purple-200 focus:ring-purple-400"}`,
              required: true,
              ref: manualJobDescriptionRef
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "p",
            {
              className: `text-xs ${manualJobDescriptionHasError ? "text-rose-600 font-semibold" : "text-purple-500"}`,
              children: manualJobDescriptionHelperText
            }
          ),
          hasManualJobDescriptionInput && /* @__PURE__ */ jsxRuntimeExports.jsx(JobDescriptionPreview, { text: manualJobDescription })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-semibold text-purple-700", htmlFor: "manual-certificates", children: "Manual Certificates" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              id: "manual-certificates",
              value: manualCertificatesInput,
              onChange: (e) => setManualCertificatesInput(e.target.value),
              placeholder: "e.g. AWS Certified Solutions Architect - Amazon; PMP by PMI",
              className: "w-full h-24 p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-500", children: "Paste certificates if Credly is unavailable. Separate entries with commas or new lines." })
        ] })
      ] })
    ] }),
    filteredDashboardStageOptions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-5", "aria-label": "Improvement dashboard", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2 sm:gap-3", children: filteredDashboardStageOptions.map((stage) => {
        const isActive = activeDashboardStage === stage.key;
        const badgeLabel = stage.key === "score" ? stage.ready ? "Ready" : "Pending" : stage.count > 99 ? "99+" : String(stage.count ?? 0);
        const badgeTone = isActive ? "bg-white/20 text-white" : stage.ready ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => setActiveDashboardStage(stage.key),
            className: `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 ${isActive ? "border-purple-600 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30" : "border-slate-200 bg-white/80 text-slate-600 hover:border-purple-300 hover:text-purple-700"}`,
            "aria-pressed": isActive ? "true" : "false",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: stage.label }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone}`, children: badgeLabel })
            ]
          },
          stage.key
        );
      }) }),
      currentPhase === "score" && activeDashboardStage === "score" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        DashboardStage,
        {
          stageLabel: "Score Stage",
          title: "Score Overview",
          description: "Monitor baseline ATS alignment and rerun scoring after each accepted update.",
          accent: "indigo",
          actions: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-end gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: handleScoreSubmit,
                disabled: rescoreDisabled,
                className: `inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${rescoreDisabled ? "bg-indigo-300 cursor-not-allowed" : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"}`,
                "aria-busy": isProcessing ? "true" : "false",
                children: rescoreButtonLabel
              }
            ),
            rescoreHelperMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-indigo-700/80 text-right", children: rescoreHelperMessage })
          ] }),
          children: scoreDashboardHasContent ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ATSScoreDashboard,
              {
                metrics: scoreBreakdown,
                baselineMetrics: baselineScoreBreakdown,
                match,
                metricActionMap: currentPhase === "enhance" ? metricImprovementActionMap : null,
                onImproveMetric: currentPhase === "enhance" ? handleImprovementClick : void 0,
                improvementState: currentPhase === "enhance" ? metricImprovementState : {}
              }
            ),
            scoreDashboardReady && showDeltaSummary && /* @__PURE__ */ jsxRuntimeExports.jsx(DeltaSummaryPanel, { summary: deltaSummary })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-3xl border border-dashed border-indigo-200/80 bg-white/70 p-6 text-sm text-indigo-700", children: isProcessing ? "Scoring in progress. Sit tight while we calculate your ATS metrics and current chances." : "Upload your resume and job description to generate your ATS scores automatically." })
        }
      ),
      isEnhancementReviewPhase && activeDashboardStage === "suggestions" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        DashboardStage,
        {
          stageLabel: "Suggestions Stage",
          title: "Review AI Suggestions",
          description: "Work through targeted improvements and accept the updates you like.",
          children: improvementResults.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 rounded-2xl border border-purple-200/60 bg-purple-50/60 p-4 text-sm text-purple-800", children: "We added JD-aligned skills and highlights so you can prep for interview questions. Use the cards below to accept, reject, or preview each update." }),
              hasPendingImprovementDecisions && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: handleAcceptAllImprovements,
                  disabled: improvementButtonsDisabled,
                  className: `inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 ${improvementButtonsDisabled ? "bg-purple-300 cursor-not-allowed" : "bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"}`,
                  "aria-busy": isBulkAccepting ? "true" : "false",
                  children: isBulkAccepting ? "Accepting…" : "Accept all pending"
                }
              )
            ] }),
            enhanceAllSummaryText && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-emerald-700", children: "Enhance All summary" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 leading-relaxed", children: [
                "Combined updates — ",
                enhanceAllSummaryText
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: improvementResults.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              ImprovementCard,
              {
                suggestion: item,
                onReject: () => handleRejectImprovement(item.id),
                onPreview: () => handlePreviewImprovement(item)
              },
              item.id
            )) })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700", children: improvementsUnlocked ? "Review the Step 2 ATS dashboard, then choose an improvement above to preview tailored rewrites before you generate downloads." : "Complete Step 2 (Score) to populate your ATS dashboard. Once the metrics are ready, you can unlock focused improvement options tailored to the analysis." })
        }
      ),
      isEnhancementReviewPhase && activeDashboardStage === "changelog" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        DashboardStage,
        {
          stageLabel: "Change Log Stage",
          title: "Track accepted changes",
          description: "Review every applied enhancement and download previous versions when needed.",
          accent: "slate",
          actions: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: `text-xs font-semibold rounded-full border px-3 py-1 ${changeLogCount > 0 ? "border-slate-200 bg-white/70 text-slate-600" : "border-slate-200 bg-white/50 text-slate-400"}`,
              children: [
                changeLogCount,
                " update",
                changeLogCount === 1 ? "" : "s"
              ]
            }
          ),
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
            Array.isArray(changeLogSummaryData == null ? void 0 : changeLogSummaryData.highlights) && changeLogSummaryData.highlights.length > 0 || Array.isArray(changeLogSummaryData == null ? void 0 : changeLogSummaryData.categories) && changeLogSummaryData.categories.length > 0 || changeLogSummaryContext && Object.values(changeLogSummaryContext).some(
              (value) => typeof value === "string" && value.trim()
            ) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
              ChangeLogSummaryPanel,
              {
                summary: changeLogSummaryData,
                context: changeLogSummaryContext
              }
            ) : null,
            changeLog.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-3", children: changeLog.map((entry) => {
              const historyEntry = resumeHistoryMap.get(entry.id);
              const reverted = Boolean(entry.reverted);
              const revertedAtLabel = (() => {
                if (!reverted)
                  return "";
                const timestamp = entry.revertedAt ? new Date(entry.revertedAt) : null;
                if (!timestamp || Number.isNaN(timestamp.getTime())) {
                  return "Reverted";
                }
                return `Reverted ${timestamp.toLocaleString()}`;
              })();
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "li",
                {
                  className: "rounded-2xl border border-slate-200/70 bg-white/85 shadow-sm p-4 space-y-2",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-base font-semibold text-slate-900", children: entry.title }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-700/90 leading-relaxed", children: entry.detail })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "span",
                        {
                          className: `text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full ${changeLabelStyles[entry.label] || changeLabelStyles.fixed}`,
                          children: CHANGE_TYPE_LABELS[entry.label] || CHANGE_TYPE_LABELS.fixed
                        }
                      )
                    ] }),
                    historyEntry && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2 pt-1", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: () => handleDownloadPreviousVersion(entry.id),
                          className: "px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900 transition",
                          children: "Download previous version"
                        }
                      ),
                      !reverted && /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: () => handleRevertChange(entry.id),
                          className: "px-3 py-1.5 rounded-full border border-rose-200 text-xs font-semibold text-rose-600 hover:border-rose-300 hover:text-rose-700 transition",
                          children: "Undo change"
                        }
                      ),
                      reverted && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-rose-600", children: revertedAtLabel })
                    ] }),
                    (entry.before || entry.after || entry.summarySegments && entry.summarySegments.length > 0 || entry.addedItems && entry.addedItems.length > 0 || entry.removedItems && entry.removedItems.length > 0 || entry.itemizedChanges && entry.itemizedChanges.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      ChangeComparisonView,
                      {
                        before: entry.before,
                        after: entry.after,
                        summarySegments: entry.summarySegments,
                        addedItems: entry.addedItems,
                        removedItems: entry.removedItems,
                        itemizedChanges: entry.itemizedChanges,
                        categoryChangelog: entry.categoryChangelog
                      }
                    )
                  ]
                },
                entry.id
              );
            }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-600", children: "Accept improvements to build your change history and compare every revision." })
          ] })
        }
      )
    ] }),
    currentPhase === "score" && selectionInsights && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-4 rounded-3xl bg-white/85 border border-emerald-200/70 shadow-xl p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 md:flex-row md:items-center md:justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-emerald-600", children: "Selection Probability" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 text-5xl font-black text-emerald-700", children: [
            selectionInsights.probability ?? "—",
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-emerald-700/90", children: selectionInsights.message || "Projected probability that this resume will be shortlisted for the JD." })
        ] }),
        selectionInsights.level && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "caps-label-tight self-start rounded-full bg-emerald-100 px-4 py-1 text-xs font-semibold text-emerald-700", children: [
          selectionInsights.level,
          " Outlook"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-emerald-800/90", children: selectionInsights.summary || "Your chances of selection have increased. Prepare for the interview and learn these skills!" }),
      hasLearningResources && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-emerald-800", children: "Learning sprint" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-emerald-700", children: "Follow these quick resources to close the remaining skill gaps before interviews." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 space-y-3", children: learningResources.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "li",
          {
            className: "rounded-xl border border-emerald-200 bg-white/90 p-3 shadow-sm",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-emerald-800", children: entry.skill }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-2", children: entry.resources.map((resource, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "text-sm text-emerald-700", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "a",
                  {
                    href: resource.url,
                    target: "_blank",
                    rel: "noreferrer",
                    className: "font-semibold text-emerald-700 hover:text-emerald-800 hover:underline",
                    children: resource.title
                  }
                ),
                resource.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-emerald-600", children: resource.description })
              ] }, `${entry.skill}-${index2}`)) })
            ]
          },
          entry.skill
        )) })
      ] }),
      jobFitScores.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "caps-label text-xs font-semibold text-emerald-600", children: "Job Fit Breakdown" }),
          typeof jobFitAverage === "number" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-widest text-emerald-700", children: [
            "Avg ",
            jobFitAverage,
            "%"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: jobFitScores.map((metric) => {
          const tone = jobFitToneStyles[metric.status] || jobFitToneStyles.default;
          const safeScore = typeof metric.score === "number" ? metric.score : 0;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: `rounded-2xl border px-4 py-3 shadow-sm ${tone.container}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: metric.label }),
                    metric.status && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "span",
                      {
                        className: `mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest ${tone.chip}`,
                        children: formatStatusLabel(metric.status)
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `text-lg font-bold ${tone.scoreText}`, children: [
                    safeScore,
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 h-2 w-full rounded-full bg-white/60", role: "img", "aria-label": `${metric.label} score ${safeScore}%`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: `h-full rounded-full ${tone.bar}`,
                    style: { width: `${Math.min(Math.max(safeScore, 0), 100)}%` },
                    "aria-hidden": "true"
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs leading-relaxed", children: metric.message })
              ]
            },
            metric.key
          );
        }) })
      ] }),
      ((_a = selectionInsights.flags) == null ? void 0 : _a.length) > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: selectionInsights.flags.map((flag) => {
        const toneClass = flag.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : flag.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-sky-50 border-sky-200 text-sky-800";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: `rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: flag.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm leading-relaxed", children: flag.detail || flag.message || "" })
            ]
          },
          `${flag.key}-${flag.title}`
        );
      }) })
    ] }),
    currentPhase === "score" && analysisHighlights.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-4 rounded-3xl bg-white/85 border border-purple-200/70 shadow-xl p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-semibold text-purple-900", children: "Match Checklist" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-purple-700/80", children: "Review these alignment notes to close remaining gaps before submitting your application." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-3", children: analysisHighlights.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "li",
        {
          className: `rounded-2xl border px-4 py-3 shadow-sm ${highlightToneStyles[item.tone] || highlightToneStyles.info}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: item.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm leading-relaxed", children: item.message })
          ]
        },
        item.key
      )) })
    ] }),
    currentPhase === "score" && match && /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "space-y-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-3xl bg-white/80 backdrop-blur border border-purple-200/70 shadow-xl p-6 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-purple-900", children: "Skill Coverage Snapshot" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-left text-sm text-purple-800", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "uppercase text-xs tracking-wide text-purple-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2", children: "Skill" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 text-right", children: "Match" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: (() => {
          const rows = [...match.table || []];
          while (rows.length < 5)
            rows.push({ skill: "—", matched: false });
          return rows.slice(0, 5).map((row, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-t border-purple-100/60", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2", children: row.skill }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 text-right font-semibold", children: row.matched ? "✓" : "✗" })
          ] }, `${row.skill}-${idx}`));
        })() })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-purple-800 font-medium", children: formatMatchMessage(
        typeof match.originalScore === "number" && Number.isFinite(match.originalScore) ? match.originalScore : 0,
        typeof match.enhancedScore === "number" && Number.isFinite(match.enhancedScore) ? match.enhancedScore : typeof match.originalScore === "number" && Number.isFinite(match.originalScore) ? match.originalScore : 0
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-purple-700 space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Added keywords: ",
          match.addedSkills.length > 0 ? match.addedSkills.join(", ") : "None"
        ] }),
        match.missingSkills.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Still missing: ",
          match.missingSkills.join(", ")
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-dashed border-purple-200/80 bg-white/70 px-4 py-3 text-sm text-purple-700/90", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-purple-800", children: "Enhancements unlock in the next step." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: improveSkillsAction.helper ? improveSkillsAction.helper : "Move to Enhance to add AI-recommended skills once you finish reviewing these scores." }),
        !improvementsUnlocked && improvementUnlockMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs font-semibold text-purple-600", children: improvementUnlockMessage })
      ] })
    ] }) }),
    currentPhase === "enhance" && certificateInsights && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3 rounded-3xl bg-white/80 border border-blue-200/70 shadow-xl p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-semibold text-blue-900", children: "Certificate Insights" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-blue-800/90", children: [
        "We detected ",
        knownCertificateNames.length,
        " certificates across your resume, LinkedIn, and manual inputs."
      ] }),
      knownCertificateNames.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-blue-800/90 space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Currently listed on your resume:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc pl-5 space-y-1", children: knownCertificateNames.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: item }, item)) })
      ] }),
      certificateInsights.manualEntryRequired && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-rose-600 font-semibold", children: "Credly requires authentication. Please paste key certifications manually above so we can include them." }),
      missingCertificateNames.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-amber-800/90 space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Missing for this JD:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc pl-5 space-y-1", children: missingCertificateNames.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: item }, `missing-${item}`)) })
      ] }),
      additionalRecommendedCertificates.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-blue-800/90 space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Recommended additions to boost this match:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc pl-5 space-y-1", children: additionalRecommendedCertificates.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: item }, `recommended-${item}`)) })
      ] }) : recommendedCertificateNames.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-blue-700/80", children: "Recommended additions align with the missing certifications listed above." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-blue-700/80", children: "No additional certifications recommended." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 pt-3", children: [
        improveCertificationsAction.helper && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-blue-800/80 flex-1 min-w-[200px]", children: improveCertificationsAction.helper }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => handleImprovementClick("improve-certifications"),
            disabled: improvementButtonsDisabled,
            className: `inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${improvementButtonsDisabled ? "bg-blue-300 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700"}`,
            "aria-busy": activeImprovement === "improve-certifications" ? "true" : "false",
            children: activeImprovement === "improve-certifications" ? "Improving…" : improveCertificationsAction.label
          }
        )
      ] }),
      !improvementsUnlocked && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-blue-700", children: improvementUnlockMessage })
    ] }),
    currentPhase === "enhance" && improvementActions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-4 rounded-3xl bg-white/85 border border-purple-200/70 shadow-xl p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-purple-500", children: "Step 3 · Improve" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-2xl font-bold text-purple-900", children: "Targeted Improvements" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Choose which section to enhance after reviewing your ATS dashboard. Each rewrite keeps your experience truthful while aligning to the JD." })
      ] }),
      scoreDashboardReady ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
        renderTemplateSelection("improvements"),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: improvementActions.map((action) => {
          const isSelected = selectedImprovementSet.has(action.key);
          const isActive = activeImprovement === action.key || activeImprovement === "batch" && activeImprovementBatchKeys.includes(action.key);
          const buttonDisabled = isProcessing || improvementBusy || !improvementsUnlocked;
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => handleImprovementClick(action.key),
              disabled: buttonDisabled,
              className: `rounded-2xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm hover:shadow-lg transition ${isActive ? "opacity-70 cursor-wait" : buttonDisabled ? "opacity-60 cursor-not-allowed" : "hover:-translate-y-0.5"}`,
              "aria-busy": isActive,
              "aria-disabled": buttonDisabled,
              title: !improvementsUnlocked && improvementUnlockMessage ? improvementUnlockMessage : void 0,
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: "pt-1",
                    onClick: (event) => event.stopPropagation(),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "checkbox",
                        className: "h-5 w-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500",
                        checked: isSelected,
                        onChange: () => handleToggleImprovementSelection(action.key),
                        disabled: buttonDisabled,
                        "aria-label": `Select ${action.label}`
                      }
                    )
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 flex-1", children: [
                  action.icon && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50/90 p-2 ring-1 ring-purple-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: action.icon, alt: "", className: "h-8 w-8", "aria-hidden": "true" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold text-purple-800", children: action.label }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-600", children: action.helper }),
                    isSelected && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700", children: "Selected" })
                  ] }),
                  isActive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-6 w-6 shrink-0 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" })
                ] })
              ] })
            },
            action.key
          );
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: handleSelectAllImprovements,
                disabled: improvementButtonsDisabled,
                className: "inline-flex items-center rounded-full border border-purple-200 px-4 py-1.5 font-semibold text-purple-700 transition hover:border-purple-300 hover:text-purple-900 disabled:cursor-not-allowed disabled:opacity-60",
                children: "Select all"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: handleClearImprovementSelection,
                disabled: !hasSelectedImprovements,
                className: "inline-flex items-center rounded-full border border-purple-200 px-4 py-1.5 font-semibold text-purple-700 transition hover:border-purple-300 hover:text-purple-900 disabled:cursor-not-allowed disabled:opacity-60",
                children: "Clear"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-purple-600", children: hasSelectedImprovements ? `${selectedImprovementCount} selected` : "No improvements selected" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: handleRunSelectedImprovements,
              disabled: !hasSelectedImprovements || improvementButtonsDisabled,
              className: "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60",
              "aria-busy": activeImprovement === "batch" ? "true" : "false",
              children: improvementBusy && activeImprovement === "batch" ? "Generating…" : `Generate selected${hasSelectedImprovements ? ` (${selectedImprovementCount})` : ""}`
            }
          )
        ] }),
        improvementsUnlocked && improvementResults.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700", children: "Review the Step 2 ATS dashboard, then choose an improvement above to preview tailored rewrites before you generate downloads." })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700", children: "Complete Step 2 (Score) to populate your ATS dashboard. Once the metrics are ready, you can unlock focused improvement options tailored to the analysis." })
    ] }),
    currentPhase === "enhance" && resumeComparisonData && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-2xl font-bold text-purple-900", children: "Original vs Enhanced CV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Review the baseline upload alongside the improved version. Highlights call out key additions and removals." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ChangeComparisonView,
        {
          before: resumeComparisonData.before,
          after: resumeComparisonData.after,
          beforeLabel: "Original CV",
          afterLabel: "Enhanced CV",
          summarySegments: resumeComparisonData.summarySegments,
          addedItems: resumeComparisonData.addedItems,
          removedItems: resumeComparisonData.removedItems,
          itemizedChanges: resumeComparisonData.itemizedChanges,
          className: "text-purple-900"
        }
      )
    ] }),
    currentPhase === "enhance" && resumeText && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 md:flex-row md:items-center md:justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-semibold text-purple-900", children: "Original CV Preview" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-purple-600", children: "This is the exact text parsed from your upload. Review it, then run ATS improvements only if needed." })
        ] }),
        initialAnalysisSnapshot && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleResetToOriginal,
            disabled: !resetAvailable,
            className: "inline-flex items-center justify-center rounded-full border border-purple-300 px-4 py-2 text-sm font-semibold text-purple-700 transition hover:border-purple-400 hover:text-purple-900 disabled:cursor-not-allowed disabled:opacity-60",
            title: resetAvailable ? "Restore the resume and dashboard scores from your original upload." : "Original upload already in view.",
            children: "Reset to original upload"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          value: resumeText,
          onChange: (e) => setResumeText(e.target.value),
          className: "w-full h-64 p-4 rounded-2xl border border-purple-200 bg-white/80 text-sm text-purple-900"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-600", children: "Accepting improvements updates this preview so you can compare every change against the original upload." })
    ] }),
    currentPhase === "generate" && outputFiles.length === 0 && improvementsUnlocked && improvementsRequireAcceptance && !hasAcceptedImprovement && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-2xl font-bold text-purple-900", children: "Review Improvements First" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Apply at least one AI-generated improvement to unlock the enhanced CV and cover letter downloads." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700", children: "Explore the targeted fixes above, accept the ones you like, and then return here to generate the upgraded documents." })
    ] }),
    currentPhase === "generate" && outputFiles.length === 0 && improvementsUnlocked && canGenerateEnhancedDocs && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-purple-500", children: "Step 4 · Generate" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-2xl font-bold text-purple-900", children: "Generate Enhanced Documents" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: improvementsRequireAcceptance ? "Apply the improvements you like, then create polished CV and cover letter downloads tailored to the JD." : "Great news — no manual fixes were required. Generate polished CV and cover letter downloads tailored to the JD." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
        renderTemplateSelection("downloads"),
        downloadTemplateSummaryMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-purple-700/90", children: downloadTemplateSummaryMessage }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleGenerateEnhancedDocs,
            disabled: isProcessing || improvementBusy || isGeneratingDocs,
            className: "inline-flex items-center justify-center rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-purple-300",
            children: isGeneratingDocs ? "Generating enhanced documents…" : "Generate enhanced CV & cover letters"
          }
        ) })
      ] })
    ] }),
    currentPhase === "download" && downloadsReady && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "caps-label text-xs font-semibold text-purple-500", children: "Step 5 · Download" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-2xl font-bold text-purple-900", children: "Download Enhanced Documents" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Download tailored cover letters plus your original and AI-enhanced CVs. Links remain active for 60 minutes." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
        renderTemplateSelection("downloads"),
        downloadTemplateSummaryMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-purple-700/90", children: downloadTemplateSummaryMessage }),
        downloadGroups.resume.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-purple-900", children: "CV Files" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Compare the uploaded CV with enhanced versions optimised for the job description." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: downloadGroups.resume.map((file) => renderDownloadCard(file)) })
        ] }),
        downloadGroups.cover.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-purple-900", children: "Cover Letters" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Two tailored narratives to suit different recruiter preferences." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: downloadGroups.cover.map((file) => renderDownloadCard(file)) })
        ] }),
        downloadGroups.other.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-purple-900", children: "Additional Files" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/80", children: "Other generated documents are available below." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: downloadGroups.other.map((file) => renderDownloadCard(file)) })
        ] })
      ] })
    ] }),
    previewFile && (() => {
      var _a2, _b, _c;
      const previewDownloadStateKey = getDownloadStateKey(previewFile);
      const previewResolvedStateKey = previewDownloadStateKey || (typeof previewFile.url === "string" ? previewFile.url : "");
      const previewDownloadState = previewResolvedStateKey ? downloadStates[previewResolvedStateKey] : void 0;
      const previewIsDownloading = (previewDownloadState == null ? void 0 : previewDownloadState.status) === "loading";
      const previewHasError = (previewDownloadState == null ? void 0 : previewDownloadState.status) === "error";
      const previewDownloadError = (previewDownloadState == null ? void 0 : previewDownloadState.error) || "";
      const pendingDownloadKey = pendingDownloadFile ? getDownloadStateKey(pendingDownloadFile) : "";
      const previewRequiresConfirmation = Boolean(
        pendingDownloadFile && (pendingDownloadKey && pendingDownloadKey === previewDownloadStateKey || pendingDownloadFile.url && pendingDownloadFile.url === previewFile.url)
      );
      const expiryDate = previewFile.expiresAt ? new Date(previewFile.expiresAt) : null;
      const expiryValid = expiryDate && !Number.isNaN(expiryDate.getTime());
      const previewExpired = Boolean(expiryValid && expiryDate.getTime() <= Date.now());
      const previewHasUrl = typeof previewFile.url === "string" && previewFile.url;
      const previewStorageKey = typeof previewFile.storageKey === "string" ? previewFile.storageKey.trim() : "";
      const previewCanRefresh = Boolean(previewStorageKey);
      const previewPresentation = previewFile.presentation || getDownloadPresentation(previewFile);
      const previewButtonDisabled = previewIsDownloading || previewHasError || !previewHasUrl && !previewCanRefresh;
      const previewLinkDisabled = previewExpired || !previewHasUrl || previewHasError;
      const previewTemplateMeta = previewFile.templateMeta || {};
      const previewTemplateName = typeof previewTemplateMeta.name === "string" && previewTemplateMeta.name.trim() || typeof previewFile.templateName === "string" && previewFile.templateName.trim() || typeof previewFile.coverTemplateName === "string" && previewFile.coverTemplateName.trim() || "";
      const previewTemplateId = typeof previewTemplateMeta.id === "string" && previewTemplateMeta.id.trim() || typeof previewFile.templateId === "string" && previewFile.templateId.trim() || typeof previewFile.coverTemplateId === "string" && previewFile.coverTemplateId.trim() || typeof previewFile.template === "string" && previewFile.template.trim() || "";
      const previewDownloadFileName = previewHasUrl ? deriveDownloadFileName(previewFile, previewPresentation, null, {
        templateName: previewTemplateName,
        templateId: previewTemplateId,
        generatedAt: previewFile.generatedAt,
        contentTypeOverride: "application/pdf",
        forcePdfExtension: true,
        versionId: previewFile.versionId,
        versionHash: previewFile.versionHash
      }) : "";
      const previewDownloadLinkLabel = previewPresentation.linkLabel || "Download File";
      const previewDownloadLinkClass = `text-sm font-semibold transition ${previewLinkDisabled ? "text-rose-500 cursor-not-allowed" : "text-purple-700 hover:text-purple-900 underline decoration-purple-300 decoration-2 underline-offset-4"}`;
      const downloadButtonLabel = (() => {
        if (previewHasError)
          return "Link unavailable";
        if (previewIsDownloading)
          return "Downloading…";
        if (previewExpired)
          return previewCanRefresh ? "Refresh link" : "Link expired";
        if (!previewHasUrl)
          return previewCanRefresh ? "Refresh link" : "Link unavailable";
        return "Download PDF";
      })();
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": `Preview for ${((_a2 = previewFile.presentation) == null ? void 0 : _a2.label) || "generated file"}`,
          onClick: closeDownloadPreview,
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "w-full max-w-5xl rounded-3xl bg-white shadow-2xl border border-purple-200/70 overflow-hidden",
              onClick: (event) => event.stopPropagation(),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-purple-900", children: ((_b = previewFile.presentation) == null ? void 0 : _b.label) || "Generated document preview" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/90", children: "Review this PDF before downloading to confirm the enhancements look right." })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: closeDownloadPreview,
                      className: "text-sm font-semibold text-purple-700 hover:text-purple-900",
                      children: "Close"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-slate-50 px-6 py-6", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-[70vh] w-full overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-inner", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "iframe",
                    {
                      src: previewHasUrl ? `${previewFile.url}#toolbar=0&navpanes=0` : void 0,
                      title: ((_c = previewFile.presentation) == null ? void 0 : _c.label) || "Document preview",
                      className: "h-full w-full"
                    }
                  ) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-xs text-purple-600", children: "Trouble viewing? Download the PDF instead to open it in your preferred reader." })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-purple-100 bg-white/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-purple-600 space-y-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: previewRequiresConfirmation ? "Looks good? Confirm this preview before downloading your PDF." : "Happy with the updates? Download the PDF once you have reviewed it." }),
                    previewDownloadError && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block font-semibold text-rose-600", children: previewDownloadError }),
                    !previewHasUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block font-semibold text-rose-600", children: previewCanRefresh ? "Download link unavailable. Select Download to refresh it automatically." : "Download link unavailable. Please regenerate the document." }),
                    previewExpired && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block font-semibold text-rose-600", children: previewCanRefresh ? "This link expired. Select Download to refresh it automatically." : "This link has expired. Regenerate the documents to refresh the download." })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                    previewHasUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "a",
                      {
                        href: previewLinkDisabled ? void 0 : previewFile.url,
                        onClick: async (event) => {
                          if (previewLinkDisabled) {
                            event.preventDefault();
                            event.stopPropagation();
                            if (previewHasError) {
                              return;
                            }
                            if (previewCanRefresh) {
                              try {
                                await refreshDownloadLink(previewFile);
                              } catch (refreshErr) {
                                console.warn("Preview download refresh failed", refreshErr);
                              }
                            }
                            return;
                          }
                          setTimeout(() => {
                            resetUiAfterDownload();
                          }, 0);
                        },
                        className: previewDownloadLinkClass,
                        "aria-disabled": previewLinkDisabled ? "true" : void 0,
                        target: previewLinkDisabled ? void 0 : "_blank",
                        rel: previewLinkDisabled ? void 0 : "noopener noreferrer",
                        download: previewLinkDisabled ? void 0 : previewDownloadFileName || void 0,
                        children: previewDownloadLinkLabel
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        type: "button",
                        onClick: async () => {
                          await handleDownloadFile(previewFile);
                        },
                        disabled: previewButtonDisabled,
                        className: `inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${previewButtonDisabled ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}`,
                        children: downloadButtonLabel
                      }
                    )
                  ] })
                ] })
              ]
            }
          )
        }
      );
    })(),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      CoverLetterEditorModal,
      {
        isOpen: Boolean(coverLetterEditor),
        label: coverLetterEditor == null ? void 0 : coverLetterEditor.label,
        draftText: coverLetterEditorDraftText,
        originalText: coverLetterEditorOriginalText,
        hasChanges: coverLetterEditorHasChanges,
        wordCount: coverLetterEditorWordCount,
        onClose: closeCoverLetterEditor,
        onChange: handleCoverEditorChange,
        onReset: handleCoverEditorReset,
        onCopy: handleCoverEditorCopy,
        onDownload: handleDownloadEditedCoverLetter,
        isDownloading: isCoverLetterDownloading,
        downloadError: coverLetterDownloadError,
        clipboardStatus: coverLetterClipboardStatus,
        coverTemplateId: coverLetterEditorTemplate == null ? void 0 : coverLetterEditorTemplate.templateId,
        coverTemplateName: coverLetterEditorTemplate == null ? void 0 : coverLetterEditorTemplate.templateName
      }
    ),
    previewSuggestion && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": `Preview for ${previewSuggestion.title}`,
        onClick: closePreview,
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "w-full max-w-5xl rounded-3xl bg-white shadow-2xl border border-purple-200/70 overflow-hidden",
            onClick: (event) => event.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-purple-900", children: previewSuggestion.title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-purple-700/90", children: "Review how this change will look alongside your current resume before accepting or downloading." })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: closePreview,
                    className: "text-sm font-semibold text-purple-700 hover:text-purple-900",
                    children: "Close"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-6 text-sm text-purple-900", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                ChangeComparisonView,
                {
                  before: previewSuggestion.baseResume,
                  after: previewSuggestion.updatedResume,
                  beforeLabel: "Current Resume",
                  afterLabel: "With Improvement",
                  summarySegments: previewSuggestion.summarySegments,
                  addedItems: previewSuggestion.addedItems,
                  removedItems: previewSuggestion.removedItems,
                  itemizedChanges: previewSuggestion.itemizedChanges,
                  variant: "modal",
                  className: "text-purple-900"
                }
              ) }),
              (previewSuggestion.beforeExcerpt || previewSuggestion.afterExcerpt) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-purple-100 bg-slate-50 px-6 py-4 text-sm text-slate-700", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-800", children: "Focused change" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 grid grid-cols-1 md:grid-cols-2 gap-4", children: [
                  previewSuggestion.beforeExcerpt && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-purple-100 bg-white p-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-purple-500", children: "Before snippet" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 whitespace-pre-wrap leading-snug", children: previewSuggestion.beforeExcerpt })
                  ] }),
                  previewSuggestion.afterExcerpt && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-indigo-100 bg-white p-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-indigo-500", children: "After snippet" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 whitespace-pre-wrap leading-snug", children: previewSuggestion.afterExcerpt })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-purple-100 bg-white/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-purple-600", children: "Decide whether to apply this rewrite or keep your original wording." }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: handlePreviewReject,
                      disabled: previewRejectDisabled,
                      className: "px-4 py-2 rounded-full text-sm font-medium border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-70 disabled:cursor-not-allowed",
                      children: previewRejectLabel
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: handlePreviewAccept,
                      disabled: previewAcceptDisabled,
                      className: "px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-70 disabled:cursor-not-allowed",
                      children: previewAcceptLabel
                    }
                  )
                ] })
              ] })
            ]
          }
        )
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "text-center text-[0.65rem] uppercase tracking-[0.2em] text-purple-800/60", children: [
      "Build ",
      BUILD_VERSION
    ] })
  ] }) });
}
function bootstrapApp({
  documentRef,
  windowRef,
  importMetaEnv = {},
  AppComponent,
  reactDomClient
}) {
  var _a, _b;
  console.log("bootstrapApp called");
  if (typeof windowRef !== "undefined") {
    if (windowRef.__RESUMEFORGE_APP_MOUNTED__) {
      console.info("ResumeForge app already mounted. Skipping duplicate initialization.");
      return { container: null, app: null };
    }
    windowRef.__RESUMEFORGE_APP_MOUNTED__ = true;
  }
  if (!documentRef || typeof documentRef.getElementById !== "function") {
    throw new Error("bootstrapApp requires a documentRef with DOM helpers");
  }
  if (!AppComponent) {
    throw new Error("bootstrapApp requires an AppComponent to render");
  }
  if (!reactDomClient || typeof reactDomClient.createRoot !== "function" || typeof reactDomClient.hydrateRoot !== "function") {
    throw new Error("bootstrapApp requires reactDomClient with createRoot and hydrateRoot");
  }
  const container = documentRef.getElementById("root");
  const metaTag = (_a = documentRef.querySelector) == null ? void 0 : _a.call(documentRef, 'meta[name="resumeforge-api-base"]');
  const metaContent = metaTag == null ? void 0 : metaTag.content;
  const sanitizedMetaBase = typeof metaContent === "string" ? metaContent.trim() : "";
  if (windowRef && typeof windowRef.__RESUMEFORGE_API_BASE_URL__ === "undefined") {
    const envBase = typeof importMetaEnv.VITE_API_BASE_URL === "string" ? importMetaEnv.VITE_API_BASE_URL.trim() : "";
    const initialBase = sanitizedMetaBase || envBase;
    if (initialBase && initialBase !== "undefined" && initialBase !== "null") {
      windowRef.__RESUMEFORGE_API_BASE_URL__ = initialBase;
    }
  }
  const app = React.createElement(
    React.StrictMode,
    null,
    React.createElement(AppComponent, null)
  );
  if ((_b = container == null ? void 0 : container.hasChildNodes) == null ? void 0 : _b.call(container)) {
    reactDomClient.hydrateRoot(container, app);
  } else if (container) {
    reactDomClient.createRoot(container).render(app);
  }
  return { container, app };
}
const wght = "";
const wghtItalic = "";
const _400 = "";
const _500 = "";
const _700 = "";
const resolvedImportMetaEnv = typeof import.meta !== "undefined" && import.meta && typeof import.meta === "object" && { "VITE_STAGE_NAME": "prod", "VITE_DEPLOYMENT_ENVIRONMENT": "prod", "VITE_API_BASE_URL": "https://j3a7m3jz11.execute-api.ap-south-1.amazonaws.com/prod", "VITE_PUBLISHED_CLOUDFRONT_METADATA": '{"stackName":"ResumeForge","url":"https://d109hwmzrqr39w.cloudfront.net","distributionId":"E2OWOS9JQQDVU3","apiGatewayUrl":"https://j3a7m3jz11.execute-api.ap-south-1.amazonaws.com/prod","originBucket":"resume-forge-app-2025","originRegion":"ap-south-1","originPath":"/static/client/prod/latest","updatedAt":"2025-03-18T09:30:00.000Z","degraded":false}', "BASE_URL": "./", "MODE": "production", "DEV": false, "PROD": true, "SSR": false } || globalThis.__RESUMEFORGE_IMPORT_META_ENV__ || {};
bootstrapApp({
  documentRef: typeof document !== "undefined" ? document : void 0,
  windowRef: typeof window !== "undefined" ? window : void 0,
  importMetaEnv: resolvedImportMetaEnv,
  AppComponent: App,
  reactDomClient: { createRoot, hydrateRoot }
});
if (typeof window !== "undefined" && "serviceWorker" in navigator && !resolvedImportMetaEnv.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").then((registration) => {
      if ("sync" in registration) {
        const registerSync = () => {
          registration.sync.register("resumeForgeUpload").catch(() => {
          });
        };
        window.addEventListener("online", registerSync);
        if (navigator.onLine) {
          registerSync();
        }
      } else if (registration.active) {
        const requestReplay = () => {
          registration.active.postMessage({ type: "RETRY_UPLOADS" });
        };
        window.addEventListener("online", requestReplay);
        if (navigator.onLine) {
          requestReplay();
        }
      }
    }).catch(() => {
    });
  });
}
const DEV_ENTRY_SOURCE = "/src/main.jsx";
const PROD_ENTRY_SOURCE = "/assets/index-latest.js";
const PROD_STYLESHEET_HREF = typeof window !== "undefined" && window.__RESUMEFORGE_HAS_INDEX_CSS__ ? "/assets/index-latest.css" : "";
const detectDevEnvironment = () => {
  var _a, _b;
  try {
    return Boolean((_b = (_a = import.meta) == null ? void 0 : _a.env) == null ? void 0 : _b.DEV);
  } catch (error) {
    if (typeof window !== "undefined" && window.location) {
      const host = window.location.hostname || "";
      return host === "localhost" || host === "127.0.0.1";
    }
    return false;
  }
};
const normalizeProxyBase = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const resolved = new URL(trimmed, window.location.href);
    const pathname = resolved.pathname.replace(/\/+$/, "");
    return `${resolved.origin}${pathname}`;
  } catch (error) {
    return "";
  }
};
const extractApiBaseFromMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }
  const candidate = (typeof metadata.cloudfront === "object" && metadata.cloudfront ? metadata.cloudfront.apiGatewayUrl || metadata.cloudfront.url : metadata.apiGatewayUrl || metadata.url) || "";
  return typeof candidate === "string" ? candidate : "";
};
const resolveProxyBaseCandidates = () => {
  var _a, _b;
  const bases = [];
  const seen = /* @__PURE__ */ new Set();
  const addCandidate = (raw) => {
    const normalized = normalizeProxyBase(raw);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    bases.push(normalized);
    return true;
  };
  try {
    if (typeof window !== "undefined") {
      addCandidate(window.__RESUMEFORGE_API_BASE_URL__);
    }
  } catch (error) {
  }
  try {
    if (typeof window !== "undefined") {
      const degraded = window.__RESUMEFORGE_CLOUDFRONT_DEGRADE__;
      if (degraded && typeof degraded === "object") {
        addCandidate(degraded.backupApiGatewayUrl);
      }
    }
  } catch (error) {
  }
  try {
    if (typeof window !== "undefined") {
      addCandidate(extractApiBaseFromMetadata(window.__RESUMEFORGE_CLOUDFRONT_METADATA__));
    }
  } catch (error) {
  }
  try {
    if (typeof { "stackName": "ResumeForge", "url": "https://d109hwmzrqr39w.cloudfront.net", "distributionId": "E2OWOS9JQQDVU3", "apiGatewayUrl": "https://j3a7m3jz11.execute-api.ap-south-1.amazonaws.com/prod", "originBucket": "resume-forge-app-2025", "originRegion": "ap-south-1", "originPath": "/static/client/prod/latest", "updatedAt": "2025-03-18T09:30:00.000Z", "degraded": false } !== "undefined") {
      addCandidate(extractApiBaseFromMetadata({ "stackName": "ResumeForge", "url": "https://d109hwmzrqr39w.cloudfront.net", "distributionId": "E2OWOS9JQQDVU3", "apiGatewayUrl": "https://j3a7m3jz11.execute-api.ap-south-1.amazonaws.com/prod", "originBucket": "resume-forge-app-2025", "originRegion": "ap-south-1", "originPath": "/static/client/prod/latest", "updatedAt": "2025-03-18T09:30:00.000Z", "degraded": false }));
    }
  } catch (error) {
  }
  try {
    const meta = document.querySelector('meta[name="resumeforge-api-base"]');
    if (meta && typeof meta.getAttribute === "function") {
      addCandidate(meta.getAttribute("content"));
    }
  } catch (error) {
  }
  try {
    const inputs = document.querySelectorAll("input[data-backup-api-base]");
    inputs.forEach((input) => {
      if (!input) {
        return;
      }
      const value = typeof input.value === "string" ? input.value : typeof input.getAttribute === "function" ? input.getAttribute("value") : "";
      addCandidate(value);
    });
  } catch (error) {
  }
  try {
    if (typeof window !== "undefined") {
      const host = typeof ((_a = window.location) == null ? void 0 : _a.hostname) === "string" ? window.location.hostname : "";
      if (host && /\.execute-api\./i.test(host)) {
        addCandidate((_b = window.location) == null ? void 0 : _b.origin);
      }
    }
  } catch (error) {
  }
  return bases;
};
const buildStaticProxyUrl = (base, assetPath) => {
  const normalizedBase = normalizeProxyBase(base);
  if (!normalizedBase) {
    return "";
  }
  if (typeof assetPath !== "string") {
    return "";
  }
  let sanitized = assetPath.trim();
  if (!sanitized) {
    return "";
  }
  while (sanitized.startsWith("../")) {
    sanitized = sanitized.slice(3);
  }
  while (sanitized.startsWith("./")) {
    sanitized = sanitized.slice(2);
  }
  sanitized = sanitized.replace(/^\/+/, "");
  if (!sanitized) {
    return "";
  }
  return `${normalizedBase}/api/static-proxy?asset=${encodeURIComponent(sanitized)}`;
};
const appendStylesheet = (href) => {
  if (typeof href !== "string" || !href.trim()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-src", href);
    link.dataset.resumeforgeEntry = "true";
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener(
      "error",
      (event) => {
        reject((event == null ? void 0 : event.error) || new Error(`Failed to load stylesheet: ${href}`));
      },
      { once: true }
    );
    document.head.appendChild(link);
  });
};
const appendModuleScript = (src) => {
  if (typeof src !== "string" || !src.trim()) {
    return Promise.reject(new Error("Missing module source."));
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.async = false;
    script.src = src;
    script.setAttribute("data-src", src);
    script.dataset.resumeforgeEntry = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      (event) => {
        reject((event == null ? void 0 : event.error) || new Error(`Failed to load module script: ${src}`));
      },
      { once: true }
    );
    document.body.appendChild(script);
  });
};
const loadStylesheetWithFallback = async (href) => {
  if (typeof href !== "string" || !href.trim()) {
    return;
  }
  try {
    await appendStylesheet(href);
    return;
  } catch (error) {
    console.warn("ResumeForge entry stylesheet failed to load.", {
      source: href,
      error
    });
  }
  const candidates = resolveProxyBaseCandidates();
  for (const base of candidates) {
    const proxyUrl = buildStaticProxyUrl(base, href);
    if (!proxyUrl) {
      continue;
    }
    try {
      console.warn("Retrying ResumeForge entry stylesheet via static proxy fallback.", {
        source: href,
        proxy: proxyUrl,
        base
      });
      await appendStylesheet(proxyUrl);
      return;
    } catch (proxyError) {
      console.warn("ResumeForge entry stylesheet static proxy fallback failed.", {
        source: href,
        proxy: proxyUrl,
        base,
        error: proxyError
      });
    }
  }
  throw new Error(`Unable to load stylesheet: ${href}`);
};
const loadModuleWithFallback = async (src) => {
  try {
    await appendModuleScript(src);
    return;
  } catch (error) {
    console.warn("ResumeForge entry module failed to load.", {
      source: src,
      error
    });
  }
  const candidates = resolveProxyBaseCandidates();
  for (const base of candidates) {
    const proxyUrl = buildStaticProxyUrl(base, src);
    if (!proxyUrl) {
      continue;
    }
    try {
      console.warn("Retrying ResumeForge entry module via static proxy fallback.", {
        source: src,
        proxy: proxyUrl,
        base
      });
      await appendModuleScript(proxyUrl);
      return;
    } catch (proxyError) {
      console.warn("ResumeForge entry module static proxy fallback failed.", {
        source: src,
        proxy: proxyUrl,
        base,
        error: proxyError
      });
    }
  }
  throw new Error(`Unable to load module script: ${src}`);
};
const bootstrap = async () => {
  const devEnvironment = detectDevEnvironment();
  if (devEnvironment) {
    await appendModuleScript(DEV_ENTRY_SOURCE);
    return;
  }
  try {
    await loadStylesheetWithFallback(PROD_STYLESHEET_HREF);
  } catch (error) {
    console.warn("ResumeForge entry stylesheet fallback exhausted.", {
      source: PROD_STYLESHEET_HREF,
      error
    });
  }
  await loadModuleWithFallback(PROD_ENTRY_SOURCE);
};
bootstrap().catch((error) => {
  console.error("ResumeForge client bootstrap failed.", error);
});
