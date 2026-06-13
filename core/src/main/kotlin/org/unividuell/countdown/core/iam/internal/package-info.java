/**
 * Internal package of the iam module. Exposed as a named interface so that other modules
 * (e.g. community) can reference {@link org.unividuell.countdown.core.iam.internal.CountdownOAuth2User}
 * as the Spring Security principal type in their REST controllers.
 */
@NamedInterface("security")
package org.unividuell.countdown.core.iam.internal;

import org.springframework.modulith.NamedInterface;
