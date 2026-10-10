"""Tool schemas: what the model reads to decide when and how to call each tool."""

_ITEM_PICK = {
    "type": "object",
    "properties": {
        "item": {"type": "string", "description": "Item number from the list (e.g. '2') or its name"},
        "portion": {"type": "number", "description": "Only when they had part of it: 0.5 for half, 0.33 for a third. "
                                                     "Omit when they had it, or shared it equally with others who will also claim it."},
        "count": {"type": "integer", "description": "Only for a multi-quantity line (e.g. '3× beer'): how many of them were theirs"},
    },
    "required": ["item"],
}

PROFILE_SET = {
    "name": "profile_set",
    "description": (
        "Save facts about the person you are texting with: the name friends call them, and where they like to be "
        "paid back (Venmo, Zelle, PayPal, Cash App). Call it as soon as they tell you their name, and whenever they "
        "mention a payment handle. Their name is how friends add them to a split."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "What friends call them, e.g. 'Bob'"},
            "venmo": {"type": "string", "description": "Venmo username"},
            "zelle": {"type": "string", "description": "Phone or email registered with Zelle"},
            "paypal": {"type": "string", "description": "PayPal.me username"},
            "cashapp": {"type": "string", "description": "Cash App $cashtag"},
        },
    },
}

CONTACT_ADD = {
    "name": "contact_add",
    "description": (
        "Remember a friend's phone number under the name this person uses for them. Use it when split_open says "
        "someone is unknown or ambiguous: ask for the number, save it, then retry split_open."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "The name or nickname, e.g. 'Charlie'"},
            "phone": {"type": "string", "description": "Their phone number, any format"},
        },
        "required": ["name", "phone"],
    },
}

SPLIT_OPEN = {
    "name": "split_open",
    "description": (
        "Start splitting a bill this person paid (or is about to pay). Call it when they send a receipt photo or "
        "screenshot, or describe a bill, and say who it was with. Read every line item, the tax, the tip and the "
        "total off the receipt yourself and pass them exactly; never estimate a price. This opens a room with the "
        "other people's agents, posts the receipt there, and each agent texts its own person to ask what they had. "
        "You do not message the others yourself and you do not compute anyone's share: the tool does both. If the "
        "tip is not on the receipt, ask what they tipped before calling. Use mode='prepay' for an order that has "
        "not been paid yet, so people chip in first."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "merchant": {"type": "string", "description": "Restaurant or store name"},
            "items": {
                "type": "array",
                "description": "Every line on the receipt",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "total": {"type": "number", "description": "Line total in dollars as printed (for 2× at $7, pass 14)"},
                        "qty": {"type": "integer", "description": "Quantity on the line, default 1"},
                    },
                    "required": ["name", "total"],
                },
            },
            "tax": {"type": "number"},
            "tip": {"type": "number"},
            "fees": {"type": "number", "description": "Service, delivery or other fees"},
            "discount": {"type": "number", "description": "Coupons or discounts, as a positive number"},
            "total": {"type": "number", "description": "Grand total charged, as printed"},
            "participants": {
                "type": "array", "items": {"type": "string"},
                "description": "The OTHER people on the bill, by name or phone number. Do not include the person you are texting with.",
            },
            "my_items": {"type": "array", "items": _ITEM_PICK,
                         "description": "What the person you are texting with had, if they said"},
            "mode": {"type": "string", "enum": ["settle", "prepay"],
                     "description": "settle (default): already paid, others reimburse. prepay: collect before paying."},
        },
        "required": ["merchant", "items", "participants"],
    },
}

SPLIT_CLAIM = {
    "name": "split_claim",
    "description": (
        "Record what the person you are texting with had on a bill someone else opened. Call it when they answer "
        "the 'what did you have?' question (the pending split and its numbered items are in your context). Calling "
        "it again replaces their earlier answer. When the last person answers, shares are computed and texted to "
        "everyone automatically."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "items": {"type": "array", "items": _ITEM_PICK, "description": "Everything they had"},
            "nothing": {"type": "boolean", "description": "true if they had nothing on this bill"},
            "split_id": {"type": "string", "description": "Only needed when more than one split is waiting on them"},
        },
    },
}

SPLIT_STATUS = {
    "name": "split_status",
    "description": (
        "Look up this person's splits: who has answered, what each person had, who owes what, who has paid, and "
        "the recent conversation between the agents. Use it for 'who still owes me', 'what's the status', "
        "'what did the agents say'."
    ),
    "parameters": {"type": "object", "properties": {"split_id": {"type": "string"}}},
}

SPLIT_FINALIZE = {
    "name": "split_finalize",
    "description": (
        "Compute and send out the shares now, without waiting for everyone. Only the payer can do this. Use it when "
        "the payer says to stop waiting; people who never answered carry only their part of unclaimed items."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "split_id": {"type": "string"},
            "unclaimed": {"type": "string", "enum": ["even", "payer"],
                          "description": "Items nobody claimed: split evenly (default) or the payer absorbs them"},
        },
    },
}

SPLIT_PAY = {
    "name": "split_pay",
    "description": (
        "Settle the share this person owes. method='capital_one' moves the money from their Capital One account to "
        "the payer right now: use it when they say 'pay'. If they say they already paid another way, record that "
        "with method venmo, zelle, paypal, cashapp or cash. The payer is told either way."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "method": {"type": "string", "enum": ["capital_one", "venmo", "zelle", "paypal", "cashapp", "cash"]},
            "split_id": {"type": "string", "description": "Only needed when they owe on more than one split"},
        },
        "required": ["method"],
    },
}

SPLIT_CANCEL = {
    "name": "split_cancel",
    "description": "Cancel a split this person started. Everyone on it is told. Money already sent is not refunded.",
    "parameters": {"type": "object", "properties": {"split_id": {"type": "string"}}},
}

BANK_BALANCE = {
    "name": "bank_balance",
    "description": "This person's Capital One checking balance and their most recent transactions.",
    "parameters": {"type": "object", "properties": {}},
}

ALL = (PROFILE_SET, CONTACT_ADD, SPLIT_OPEN, SPLIT_CLAIM, SPLIT_STATUS, SPLIT_FINALIZE, SPLIT_PAY, SPLIT_CANCEL, BANK_BALANCE)
