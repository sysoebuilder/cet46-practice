package com.hexun.cet.foxlet

import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Test

class BundledModelsTest {
    @Test fun publisherHashUsesUnsignedHex() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", BundledModels.sha256(ByteArrayInputStream("abc".toByteArray())))
    }
}
