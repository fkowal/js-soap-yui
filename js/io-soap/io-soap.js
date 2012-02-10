/*****************************************************************************\

 Javascript "SOAP Client" library

 @version: 2.1 - 2006.09.08
 @author: Matteo Casati - http://www.guru4.net/

 \*****************************************************************************/

YUI.add('io-soap', function(Y) {
    var SOAPClient_cacheWsdl = [],
            _typeElementPrefix = "xsd:",
            _responseMethodPrefix = "typens:";

    function _toXML(_pl) {
        var xml = "";
        for(var p in _pl)
            xml += "<" + p + ">" + _serializeParam(_pl[p]) + "</" + p + ">";
        return xml;
    }

    function _serializeParam(o)
    {
        var s = "";
        switch(typeof(o))
        {
            case "string":
                s += o.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); break;
            case "number":
            case "boolean":
                s += o.toString(); break;
            case "object":
                // Date
                if(o.constructor.toString().indexOf("function Date()") > -1)
                {

                    var year = o.getFullYear().toString();
                    var month = (o.getMonth() + 1).toString(); month = (month.length == 1) ? "0" + month : month;
                    var date = o.getDate().toString(); date = (date.length == 1) ? "0" + date : date;
                    var hours = o.getHours().toString(); hours = (hours.length == 1) ? "0" + hours : hours;
                    var minutes = o.getMinutes().toString(); minutes = (minutes.length == 1) ? "0" + minutes : minutes;
                    var seconds = o.getSeconds().toString(); seconds = (seconds.length == 1) ? "0" + seconds : seconds;
                    var milliseconds = o.getMilliseconds().toString();
                    var tzminutes = Math.abs(o.getTimezoneOffset());
                    var tzhours = 0;
                    while(tzminutes >= 60)
                    {
                        tzhours++;
                        tzminutes -= 60;
                    }
                    tzminutes = (tzminutes.toString().length == 1) ? "0" + tzminutes.toString() : tzminutes.toString();
                    tzhours = (tzhours.toString().length == 1) ? "0" + tzhours.toString() : tzhours.toString();
                    var timezone = ((o.getTimezoneOffset() < 0) ? "+" : "-") + tzhours + ":" + tzminutes;
                    s += year + "-" + month + "-" + date + "T" + hours + ":" + minutes + ":" + seconds + "." + milliseconds + timezone;
                }
                // Array
                else if(o.constructor.toString().indexOf("function Array()") > -1)
                {
                    for(var p in o)
                    {
                        if(!isNaN(p))   // linear array
                        {
                            (/function\s+(\w*)\s*\(/ig).exec(o[p].constructor.toString());
                            var type = RegExp.$1;
                            switch(type)
                            {
                                case "":
                                    type = typeof(o[p]);
                                case "String":
                                    type = "string"; break;
                                case "Number":
                                    type = "int"; break;
                                case "Boolean":
                                    type = "bool"; break;
                                case "Date":
                                    type = "DateTime"; break;
                            }
                            s += "<" + type + ">" + _serializeParam(o[p]) + "</" + type + ">";
                        }
                        else    // associative array
                            s += "<" + p + ">" + _serializeParam(o[p]) + "</" + p + ">";
                    }
                }
                // Object or custom function
                else
                    for(var p in o)
                        s += "<" + p + ">" + _serializeParam(o[p]) + "</" + p + ">";
                break;
            default:
                throw new Error(500, "SOAPClientParameters: type '" + typeof(o) + "' is not supported");
        }
        return s;
    }

    function _loadWsdl(url, cfg)
    {
        // load from cache?
        var wsdl = SOAPClient_cacheWsdl[url];
        if(wsdl + "" != "" && wsdl + "" != "undefined")
            return _sendSoapRequest(url, cfg, wsdl);
        // get wsdl
        var result = Y.io(url+"?wsdl",{
            'method': "GET",
            //headers: {'Content-Type':'text/xml; charset=utf-8'},
            xdr: cfg.xdr,
            on: {
                //Our event handlers previously defined:
                //start: handleStart,
                success: function(id, response, args) {
                    _onLoadWsdl(url, cfg, response);
                },
                failure: function(id, response, args) {
                    Y.log('_sendSoapRequest '+cfg.method,'info','io-soap');
                    var e = {response:response};
                    Y.fire('soap:wsdlLoad', e)
                    if(cfg.on && cfg.on.failure)
                    {
                        cfg.on.failure(e);
                    }
                }
            },
            sync: cfg.sync
        });
        if (cfg.sync)
            return _onLoadWsdl(url, cfg, result);
        return result;
    }

    function _onLoadWsdl(url, cfg, response) {
        var wsdl = response.responseXML;
        SOAPClient_cacheWsdl[url] = wsdl;	// save a copy in cache
        Y.fire('soap:wsdlLoad',{
            name: 'soap:wsdlLoad',
            uri: url,
            response: response
        });
        return _sendSoapRequest(url, cfg, wsdl);
    }

    function _sendSoapRequest(url, cfg, wsdl)
    {
        //Y.log('_sendSoapRequest'+cfg.method,'info','io-soap');
        if(cfg.method)
        {
            // get namespace
            var ns = (wsdl.documentElement.attributes["targetNamespace"] + "" == "undefined") ? wsdl.documentElement.attributes.getNamedItem("targetNamespace").nodeValue : wsdl.documentElement.attributes["targetNamespace"].value;
            // build SOAP request
            var sr =
                    "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                            "<soap:Envelope " +
                            "xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" " +
                            "xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" " +
                            "xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">" +
                            "<soap:Body>" +
                            "<" + cfg.method + " xmlns=\"" + ns + "\">" +
                            _toXML(cfg.params) +
                            "</" + cfg.method + "></soap:Body></soap:Envelope>";
            // send request
            var soapaction = ((ns.lastIndexOf("/") != ns.length - 1) ? ns + "/" : ns) + cfg.method;
            var result = Y.io(url,{
                'method': "POST",
                'data' : sr,
                headers: {'Content-Type':'text/xml; charset=utf-8',
                    'SOAPAction':soapaction,
                    'Soapclient':'ActionScript'},
                xdr: cfg.xdr,
                on: {
                    //Our event handlers previously defined:
                    //start: handleStart,
                    success: function(id, response, args) {
                        _onSendSoapRequest(cfg, wsdl, response, args);
                    },
                    failure: function(id, response, args) {
                        Y.log('_sendSoapRequest '+cfg.method,'info','io-soap');
                        if(cfg.on.failure)
                        {
                            var e = {response:response};
                            cfg.on.failure(e);
                        }
                    }
                },
                sync: cfg.sync,
                arguments: cfg.arguments
            });

            return result;
        }
    };

    function _onSendSoapRequest(cfg, wsdl, req, args)
    {
        //Y.log('_onSendSoapRequest '+cfg.method + req.responseText,'info','io-soap');
        var o = null;
        var e;
        var nd = _getElementsByTagName(req.responseXML, _responseMethodPrefix+cfg.method + "Response");
        if(nd.length == 0)
        {
            o = _getElementsByTagName(req.responseXML, 'SOAP-ENV:Fault');
            if(o && o.length)
            {
                o = _node2object(o[0], []);
                e = {response:req,error:o};
                if(args && args.failure)
                    e = Y.merge(e, args.failure);
                Y.fire('soap:'+cfg.method,e);
                if(cfg.on.failure)
                    cfg.on.failure(e);
            }
            else if(req.responseXML.getElementsByTagName("faultcode").length > 0) {
                o = new Error(500, req.responseXML.getElementsByTagName("faultstring")[0].childNodes[0].nodeValue);
                e = {response:req,error:o};
                Y.fire('soap:'+cfg.method,e);
                if(!cfg.sync || cfg.on.failure) {
                    if(cfg.on.failure)
                        cfg.on.failure(e);
                } else {
                    throw o;
                }
            }
        }
        else {
            o = _soapresult2object(nd[0], wsdl);
            e = {response:req, result: o};
            if(args && args.success)
                e = Y.merge(e, args.success);
            Y.fire('soap:'+cfg.method, e);
            if(cfg.on.success)
                cfg.on.success(e);
        }
        if(!cfg.sync)
            return o;
    };

    function _soapresult2object(node, wsdl)
    {
        //Y.log('_soapresult2object','info','io-soap');
        var wsdlTypes = _getTypesFromWsdl(wsdl);
        return _node2object(node, wsdlTypes);
    };

    function _node2object(node, wsdlTypes)
    {
        //Y.log('_node2object ','info','io.soap.js');
        // null node
        if(node == null)
            return null;
        // text node
        if(node.nodeType == 3 || node.nodeType == 4)
            return _extractValue(node, wsdlTypes);
        // leaf node
        if (node.childNodes.length == 1 && (node.childNodes[0].nodeType == 3 || node.childNodes[0].nodeType == 4))
            return _node2object(node.childNodes[0], wsdlTypes);
        var _typePrefix = "xsi:";
        var attrType = node.attributes.getNamedItem(_typePrefix+"type");
        if(attrType && attrType.nodeValue == _typeElementPrefix+"string" && node.childNodes.length > 1)
        {
            var value = '';
            for(var i = 0; i < node.childNodes.length; i++)
            {
                var child = node.childNodes[i];
                value += _extractValue(child, wsdlTypes);
            }
            return value;
        }
        var type = _getTypeFromWsdl(node.nodeName, wsdlTypes).toLowerCase();
        var isarray = type.indexOf("arrayof") != -1;
        if(!isarray && node.attributes.getNamedItem(_typePrefix+"type")) {
            type = node.attributes.getNamedItem(_typePrefix+"type").nodeValue;
            isarray = type.toLowerCase().indexOf('array')!= -1;

        }
        // object node
        if(!isarray)
        {
            var obj = null;
            if(node.hasChildNodes())
                obj = new Object();
            for(var i = 0; i < node.childNodes.length; i++)
            {
                var child = node.childNodes[i];
                if(child.nodeType == 3 && _extractValue(child, wsdlTypes) == "\n")
                    continue;
                if(child.nodeName) {
                    var p = _node2object(child, wsdlTypes);
                    obj[child.nodeName] = p;
                }
            }
            return obj;
        }
        // list node
        else
        {
            // create node ref
            var l = new Array();
            for(var i = 0; i < node.childNodes.length; i++)
            {
                var child = node.childNodes[i];
                if(child.nodeType == 3 && _extractValue(child, wsdlTypes) == "\n")
                    continue;
                l[l.length] = _node2object(child, wsdlTypes);
            }
            return l;
        }
        return null;
    };

    function _extractValue(node, wsdlTypes)
    {
        var value = node.nodeValue;
        var type = _getTypeFromWsdl(node.parentNode.nodeName, wsdlTypes).toLowerCase();
        var _typePrefix = "xsi:";
        if(type == "" && node.parentNode.attributes.getNamedItem(_typePrefix+"type")) {
            type = node.parentNode.attributes.getNamedItem(_typePrefix+"type").nodeValue;
        }
        switch(type)
        {
            default:
            case _typeElementPrefix+"string":
                return (value != null) ? value + "" : "";
            case _typeElementPrefix+"boolean":
                return value + "" == "true";
            case _typeElementPrefix+"int":
            case _typeElementPrefix+"long":
                return (value != null) ? parseInt(value + "", 10) : 0;
            case _typeElementPrefix+"double":
                return (value != null) ? parseFloat(value + "") : 0;
            case _typeElementPrefix+"datetime":
                if(value == null)
                    return null;
                else
                {
                    value = value + "";
                    value = value.substring(0, (value.lastIndexOf(".") == -1 ? value.length : value.lastIndexOf(".")));
                    value = value.replace(/T/gi," ");
                    value = value.replace(/-/gi,"/");
                    var d = new Date();
                    d.setTime(Date.parse(value));
                    return d;
                }
        };
    };

    function _getTypesFromWsdl(wsdl)
    {
        var wsdlTypes = new Array();
        // IE
        var ell = wsdl.getElementsByTagName(_typeElementPrefix+"element");
        var useNamedItem = true;
        // MOZ
        if(ell.length == 0)
        {
            ell = wsdl.getElementsByTagName("element");
            useNamedItem = false;
        }
        for(var i = 0; i < ell.length; i++)
        {
            if(useNamedItem)
                if(ell[i].attributes.getNamedItem("name") != null && ell[i].attributes.getNamedItem("type") != null)
                {
                    wsdlTypes[ell[i].attributes.getNamedItem("name").nodeValue] = ell[i].attributes.getNamedItem("type").nodeValue;
                }
                else
                {
                    if(ell[i].attributes["name"] != null && ell[i].attributes["type"] != null)
                        wsdlTypes[ell[i].attributes["name"].value] = ell[i].attributes["type"].value;
                }
        }
        ell = wsdl.getElementsByTagName("part");
        if(ell.length)
        {
            for(var i = 0;i < ell.length; i++)
            {
                if(useNamedItem)
                {
                    if(ell[i].attributes.getNamedItem("name") != null && ell[i].attributes.getNamedItem("type") != null)
                        wsdlTypes[ell[i].attributes.getNamedItem("name").nodeValue] = ell[i].attributes.getNamedItem("type").nodeValue;
                }
                else
                {
                    if(ell[i].attributes["name"] != null && ell[i].attributes["type"] != null)
                        wsdlTypes[ell[i].attributes["name"].value] = ell[i].attributes["type"].value;
                }
            }
        }
        return wsdlTypes;
    };

    function _getTypeFromWsdl(elementname, wsdlTypes)
    {
        var type = wsdlTypes[elementname] + "";
        return (type == "undefined") ? "" : type;
    };

    function _getElementsByTagName(document, tagName)
    {
        /*try
         {
         // trying to get node omitting any namespaces (latest versions of MSXML.XMLDocument)
         n = document.selectNodes(".//*[local-name()=\""+ tagName +"\"]");
         if(n.length)
         return n;
         }
         catch (ex) {
         //console.log('_getElementsByTagName ex1 '+ex.toString());
         }
         console.log('ssdf');*/
        // old XML parser support
        var n = document.getElementsByTagName(tagName);
        if(!n || !n.length)
        {
            tagName = tagName.split(':');
            n = document.getElementsByTagName(tagName[1]);
        }
        return n;
    };

    /**
     * c properties:
     *
     * on.success(array) - callback expecting an arrow of methods [method1:[argumentX:typeX,...],...]
     *
     * @param {string} uri
     * @param {object} c
     */
    function _getMethods(uri, c)
    {
        Y.once('soap:wsdlLoad', function(e){
            if(c.on && c.on.success)
            {
                var messages = e.response.responseXML.getElementsByTagName('message');
                var methods = [];
                if(messages.length)
                {
                    for(var i = 0; i < messages.length; i++)
                    {
                        var message = messages[i];
                        var parts = message.getElementsByTagName('part');
                        var args = [];
                        for(var j = 0; j < parts.length; j++)
                        {
                            args[parts[j].getAttribute('name')] = parts[j].getAttribute('type');
                        }
                        methods[message.getAttribute('name')] = args;
                    }
                }
                c.on.success(methods);
            }
        });
    }

    function _call(uri, cfg)
    {
        if(!cfg.sync)
            _loadWsdl(uri, cfg);
        else
            return _loadWsdl(uri, cfg);

    }

    /**
     * @return Object
     */
    function _client(uri, c) {
        var o = { uri: uri, cfg:c };

        o.call = function(method) {
            var cfg = Y.merge({soap:{method:method}},this.cfg);
            return _call(this.uri, cfg);
        };
        return o;
    }

    function _soap(uri, c)
    {
        var o = { uri: uri, cfg:c };
        /**
         * properties:
         * method: soapMethod
         * params: soapMethod(params...)
         * success: callback
         *
         * @param {object} cfg
         * @returns object
         */
        o.call = function(cfg) {
            cfg = Y.merge(cfg,this.cfg);
            return _call(this.uri, cfg);
        };
        o.client = _client;
        o.getMethods = function(cfg) {
            return _getMethods(this.uri, cfg);
        }
        return o;
    }
    Y.mix(Y.io, {
        soap: _soap
    }, true);
}, '3.1.2' ,{requires:['io-base','io-xdr'],optional:['event-custom']});
