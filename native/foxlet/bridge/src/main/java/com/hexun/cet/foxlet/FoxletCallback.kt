package com.hexun.cet.foxlet

/** Stable Java interface for plus.android.implements. Always invoked on main. */
interface FoxletCallback {
    fun onSuccess(requestId: String, result: String)
    fun onError(requestId: String, code: String, message: String)
}
